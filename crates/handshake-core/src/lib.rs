pub mod canonical;
pub mod crypto;
pub mod error;
pub mod infohash;
pub mod models;

pub use canonical::{to_canonical_json_bytes, to_canonical_json_string};
pub use crypto::{verify_detached, verify_detached_hex, KeyPair, PortableIdentity};
pub use error::CoreError;
pub use infohash::compute_info_hash;
pub use models::{
    AnchorProof, Attachment, Coordinates, Message, MessageAnchor, MessageContent, MessageHeader,
    MAX_MESSAGE_SIZE,
};
