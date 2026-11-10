use crate::error::CoreError;
use ed25519_dalek::{
    Signature, Signer, SigningKey, Verifier, VerifyingKey, PUBLIC_KEY_LENGTH, SECRET_KEY_LENGTH,
    SIGNATURE_LENGTH,
};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};

/// Represents an Ed25519 cryptographic keypair derived from a 32-byte sovereign seed.
#[derive(Clone)]
pub struct KeyPair {
    signing_key: SigningKey,
    verifying_key: VerifyingKey,
}

impl KeyPair {
    /// Generates a new cryptographically secure random KeyPair using the operating system's CSPRNG.
    pub fn generate() -> Self {
        let signing_key = SigningKey::generate(&mut OsRng);
        let verifying_key = signing_key.verifying_key();
        Self {
            signing_key,
            verifying_key,
        }
    }

    /// Derives a KeyPair from a 32-byte Ed25519 seed.
    pub fn from_seed_bytes(seed: &[u8; 32]) -> Self {
        let signing_key = SigningKey::from_bytes(seed);
        let verifying_key = signing_key.verifying_key();
        Self {
            signing_key,
            verifying_key,
        }
    }

    /// Derives a KeyPair from a 64-character hexadecimal seed string (or a legacy 128-char secret key hex).
    pub fn from_seed_hex(seed_hex: &str) -> Result<Self, CoreError> {
        let raw_bytes = hex::decode(seed_hex.trim())?;
        Self::from_private_bytes(&raw_bytes)
    }

    /// Derives a KeyPair from raw private bytes. Supports standard 32-byte seeds
    /// as well as legacy 64-byte key pairs (seed + public key).
    pub fn from_private_bytes(bytes: &[u8]) -> Result<Self, CoreError> {
        if bytes.len() == SECRET_KEY_LENGTH {
            // Standard 32-byte seed
            let mut seed = [0u8; SECRET_KEY_LENGTH];
            seed.copy_from_slice(bytes);
            Ok(Self::from_seed_bytes(&seed))
        } else if bytes.len() == 64 {
            // Legacy 64-byte secret key (TweetNaCl format: seed[0..32] + pubkey[32..64])
            let mut seed = [0u8; SECRET_KEY_LENGTH];
            seed.copy_from_slice(&bytes[..SECRET_KEY_LENGTH]);
            Ok(Self::from_seed_bytes(&seed))
        } else {
            Err(CoreError::InvalidKeyLength {
                expected: SECRET_KEY_LENGTH,
                actual: bytes.len(),
            })
        }
    }

    /// Returns the 32-byte private seed bytes.
    pub fn seed_bytes(&self) -> [u8; 32] {
        self.signing_key.to_bytes()
    }

    /// Returns the 32-byte private seed as a 64-character lowercase hex string.
    pub fn seed_hex(&self) -> String {
        hex::encode(self.seed_bytes())
    }

    /// Returns the 32-byte public key bytes.
    pub fn public_key_bytes(&self) -> [u8; 32] {
        self.verifying_key.to_bytes()
    }

    /// Returns the 32-byte public key as a 64-character lowercase hex string.
    pub fn public_key_hex(&self) -> String {
        hex::encode(self.public_key_bytes())
    }

    /// Produces a detached 64-byte Ed25519 signature over the given data bytes.
    pub fn sign(&self, data: &[u8]) -> [u8; 64] {
        self.signing_key.sign(data).to_bytes()
    }

    /// Produces a detached Ed25519 signature as a 128-character lowercase hex string.
    pub fn sign_hex(&self, data: &[u8]) -> String {
        hex::encode(self.sign(data))
    }

    /// Converts this keypair into the portable identity representation (.key format).
    pub fn to_portable_identity(&self) -> PortableIdentity {
        PortableIdentity {
            public_key: self.public_key_hex(),
            private_key: self.seed_hex(),
        }
    }
}

/// Verifies a detached 64-byte Ed25519 signature over data bytes using raw public key bytes.
pub fn verify_detached(
    public_key_bytes: &[u8],
    data: &[u8],
    signature_bytes: &[u8],
) -> Result<(), CoreError> {
    if public_key_bytes.len() != PUBLIC_KEY_LENGTH {
        return Err(CoreError::InvalidKeyLength {
            expected: PUBLIC_KEY_LENGTH,
            actual: public_key_bytes.len(),
        });
    }

    if signature_bytes.len() != SIGNATURE_LENGTH {
        return Err(CoreError::InvalidKeyLength {
            expected: SIGNATURE_LENGTH,
            actual: signature_bytes.len(),
        });
    }

    let mut pk_arr = [0u8; PUBLIC_KEY_LENGTH];
    pk_arr.copy_from_slice(public_key_bytes);
    let verifying_key = VerifyingKey::from_bytes(&pk_arr)
        .map_err(|e| CoreError::CryptoError(format!("Invalid public key: {}", e)))?;

    let signature = Signature::from_slice(signature_bytes)
        .map_err(|e| CoreError::CryptoError(format!("Invalid signature format: {}", e)))?;

    verifying_key
        .verify(data, &signature)
        .map_err(|_| CoreError::InvalidSignature)
}

/// Verifies a detached signature where public key and signature are hex-encoded strings.
pub fn verify_detached_hex(
    public_key_hex: &str,
    data: &[u8],
    signature_hex: &str,
) -> Result<(), CoreError> {
    let pk_bytes = hex::decode(public_key_hex.trim())?;
    let sig_bytes = hex::decode(signature_hex.trim())?;
    verify_detached(&pk_bytes, data, &sig_bytes)
}

/// Portable identity representation according to Section 1 of the Protocol Specification.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PortableIdentity {
    pub public_key: String,
    pub private_key: String,
}

impl PortableIdentity {
    pub fn new(public_key: String, private_key: String) -> Self {
        Self {
            public_key,
            private_key,
        }
    }

    pub fn to_keypair(&self) -> Result<KeyPair, CoreError> {
        KeyPair::from_seed_hex(&self.private_key)
    }

    pub fn to_json(&self) -> Result<String, CoreError> {
        serde_json::to_string_pretty(self).map_err(CoreError::Serialization)
    }

    pub fn from_json(json_str: &str) -> Result<Self, CoreError> {
        serde_json::from_str(json_str).map_err(CoreError::Serialization)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KNOWN_SEED_HEX: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const KNOWN_PUBKEY_HEX: &str =
        "207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6";

    #[test]
    fn test_known_answer_seed_and_pubkey_derivation() {
        let keypair = KeyPair::from_seed_hex(KNOWN_SEED_HEX).unwrap();
        assert_eq!(keypair.public_key_hex(), KNOWN_PUBKEY_HEX);
        assert_eq!(keypair.seed_hex(), KNOWN_SEED_HEX);
    }

    #[test]
    fn test_sign_and_verify_roundtrip() {
        let keypair = KeyPair::generate();
        let payload = b"Space-Time Handshake Sovereign Message Payload";
        let sig = keypair.sign(payload);

        let res = verify_detached(&keypair.public_key_bytes(), payload, &sig);
        assert!(res.is_ok());

        // Tampering payload fails
        let tampered = b"Space-Time Handshake Sovereign Tampered Payload";
        let res_tampered = verify_detached(&keypair.public_key_bytes(), tampered, &sig);
        assert!(res_tampered.is_err());
    }

    #[test]
    fn test_portable_identity_serde() {
        let kp = KeyPair::from_seed_hex(KNOWN_SEED_HEX).unwrap();
        let portable = kp.to_portable_identity();
        let json_str = portable.to_json().unwrap();

        let loaded = PortableIdentity::from_json(&json_str).unwrap();
        assert_eq!(loaded, portable);
        let derived_kp = loaded.to_keypair().unwrap();
        assert_eq!(derived_kp.public_key_hex(), KNOWN_PUBKEY_HEX);
    }
}
