use thiserror::Error;

#[derive(Error, Debug)]
pub enum CoreError {
    #[error("Message payload exceeds maximum allowed size of {limit} bytes (got {size} bytes)")]
    PayloadTooLarge { size: usize, limit: usize },

    #[error("Invalid hexadecimal string: {0}")]
    InvalidHex(#[from] hex::FromHexError),

    #[error("Invalid key length: expected {expected} bytes, got {actual} bytes")]
    InvalidKeyLength { expected: usize, actual: usize },

    #[error("Cryptographic operation failed: {0}")]
    CryptoError(String),

    #[error("Invalid signature")]
    InvalidSignature,

    #[error("Message signature is missing")]
    MissingSignature,

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Canonicalization error: {0}")]
    Canonicalization(String),

    #[error("Schema validation error: {0}")]
    SchemaValidation(String),
}
