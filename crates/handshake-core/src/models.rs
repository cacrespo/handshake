use crate::canonical::to_canonical_json_bytes;
use crate::crypto::{verify_detached_hex, KeyPair};
use crate::error::CoreError;
use serde::{Deserialize, Serialize};

/// Maximum allowed serialized message payload size (64 KB = 65,536 bytes).
pub const MAX_MESSAGE_SIZE: usize = 64 * 1024;

fn default_message_type() -> String {
    "PUBLIC".to_string()
}

fn default_proof_type() -> String {
    "NONE".to_string()
}

/// A sovereign message anchored in space and time within the Handshake protocol.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Message {
    pub version: String,
    pub header: MessageHeader,
    pub anchor: MessageAnchor,
    pub content: MessageContent,
}

/// Cryptographic header tracking author identity, message type, and genealogical graph.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct MessageHeader {
    #[serde(rename = "type", default = "default_message_type")]
    pub message_type: String,

    #[serde(default)]
    pub owner_pk: Option<String>,

    pub author_pk: String,

    #[serde(default)]
    pub parent_signature: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

/// Space-time anchor defining coordinates, geohash cell, epoch timestamp, and location proof.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct MessageAnchor {
    pub timestamp: i64,
    pub geohash: String,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coordinates: Option<Coordinates>,

    #[serde(default)]
    pub proof: AnchorProof,
}

/// Exact geographical coordinates.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Coordinates {
    pub lat: f64,
    pub lon: f64,
}

/// Location verification proof (e.g., GPS, Bluetooth proximity, or NONE).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AnchorProof {
    #[serde(rename = "type", default = "default_proof_type")]
    pub proof_type: String,

    #[serde(default)]
    pub data: Option<String>,
}

impl Default for AnchorProof {
    fn default() -> Self {
        Self {
            proof_type: default_proof_type(),
            data: None,
        }
    }
}

/// Message payload containing text and optional attachments.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct MessageContent {
    pub text: String,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<Attachment>,
}

/// Attached multimedia asset with integrity hash and MIME type.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Attachment {
    pub url: String,
    pub sha256: String,
    pub mime_type: String,
}

impl Message {
    /// Constructs a new unsigned Message with default PUBLIC header and NONE proof.
    pub fn new(author_pk: String, geohash: String, timestamp: i64, text: String) -> Self {
        Self {
            version: "1.0".to_string(),
            header: MessageHeader {
                message_type: default_message_type(),
                owner_pk: None,
                author_pk,
                parent_signature: None,
                signature: None,
            },
            anchor: MessageAnchor {
                timestamp,
                geohash,
                coordinates: None,
                proof: AnchorProof::default(),
            },
            content: MessageContent {
                text,
                attachments: Vec::new(),
            },
        }
    }

    /// Deserializes and validates a message from raw JSON bytes, enforcing the 64 KB boundary
    /// check strictly before parsing and rejecting any unrecognized schema fields.
    pub fn from_json_slice(bytes: &[u8]) -> Result<Self, CoreError> {
        if bytes.len() > MAX_MESSAGE_SIZE {
            return Err(CoreError::PayloadTooLarge {
                size: bytes.len(),
                limit: MAX_MESSAGE_SIZE,
            });
        }

        let msg: Self = serde_json::from_slice(bytes)?;
        msg.validate_schema()?;
        Ok(msg)
    }

    /// Deserializes and validates a message from a JSON string, enforcing size limits and closed schema.
    pub fn from_json_str(json_str: &str) -> Result<Self, CoreError> {
        Self::from_json_slice(json_str.as_bytes())
    }

    /// Validates protocol schema invariants and field formats.
    pub fn validate_schema(&self) -> Result<(), CoreError> {
        if self.version != "1.0" {
            return Err(CoreError::SchemaValidation(format!(
                "Unsupported protocol version: {}",
                self.version
            )));
        }

        if self.header.author_pk.trim().len() != 64 {
            return Err(CoreError::SchemaValidation(format!(
                "author_pk must be 64 hexadecimal characters, got length {}",
                self.header.author_pk.len()
            )));
        }
        hex::decode(self.header.author_pk.trim())
            .map_err(|e| CoreError::SchemaValidation(format!("Invalid author_pk hex: {}", e)))?;

        if let Some(parent) = &self.header.parent_signature {
            if parent.trim().len() != 128 {
                return Err(CoreError::SchemaValidation(format!(
                    "parent_signature must be 128 hexadecimal characters, got length {}",
                    parent.len()
                )));
            }
            hex::decode(parent.trim()).map_err(|e| {
                CoreError::SchemaValidation(format!("Invalid parent_signature hex: {}", e))
            })?;
        }

        if let Some(sig) = &self.header.signature {
            if sig.trim().len() != 128 {
                return Err(CoreError::SchemaValidation(format!(
                    "signature must be 128 hexadecimal characters, got length {}",
                    sig.len()
                )));
            }
            hex::decode(sig.trim()).map_err(|e| {
                CoreError::SchemaValidation(format!("Invalid signature hex: {}", e))
            })?;
        }

        if self.anchor.geohash.trim().is_empty() {
            return Err(CoreError::SchemaValidation(
                "geohash cannot be empty".to_string(),
            ));
        }

        // Verify canonical representation does not exceed size limit
        let signing_data = self.get_signing_data()?;
        if signing_data.len() > MAX_MESSAGE_SIZE {
            return Err(CoreError::PayloadTooLarge {
                size: signing_data.len(),
                limit: MAX_MESSAGE_SIZE,
            });
        }

        Ok(())
    }

    /// Computes RFC 8785 canonical JSON bytes for detached signature computation and verification.
    /// Excludes header.signature from the signed representation.
    pub fn get_signing_data(&self) -> Result<Vec<u8>, CoreError> {
        let mut clone = self.clone();
        clone.header.signature = None;

        let bytes = to_canonical_json_bytes(&clone)?;
        if bytes.len() > MAX_MESSAGE_SIZE {
            return Err(CoreError::PayloadTooLarge {
                size: bytes.len(),
                limit: MAX_MESSAGE_SIZE,
            });
        }
        Ok(bytes)
    }

    /// Signs the message using the author's KeyPair, populating header.signature and header.author_pk.
    /// Returns the detached signature as a 128-character hex string.
    pub fn sign(&mut self, keypair: &KeyPair) -> Result<String, CoreError> {
        self.header.author_pk = keypair.public_key_hex();
        self.header.signature = None;

        let signing_data = self.get_signing_data()?;
        let sig_hex = keypair.sign_hex(&signing_data);
        self.header.signature = Some(sig_hex.clone());
        Ok(sig_hex)
    }

    /// Verifies the cryptographic signature of the message.
    pub fn verify(&self) -> Result<bool, CoreError> {
        let sig_hex = match &self.header.signature {
            Some(s) => s,
            None => return Ok(false),
        };

        let signing_data = match self.get_signing_data() {
            Ok(b) => b,
            Err(_) => return Ok(false),
        };

        match verify_detached_hex(&self.header.author_pk, &signing_data, sig_hex) {
            Ok(()) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    /// Serializes the complete message (including signature) into compact JSON.
    pub fn to_json_string(&self) -> Result<String, CoreError> {
        serde_json::to_string(self).map_err(CoreError::Serialization)
    }
}
