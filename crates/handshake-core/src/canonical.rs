use crate::error::CoreError;
use serde::Serialize;

/// Serializes any serde Serializable value into RFC 8785 canonical JSON bytes.
///
/// Guaranteed properties of RFC 8785 JSON Canonicalization Scheme (JCS):
/// 1. UTF-8 encoded with no byte order mark (BOM).
/// 2. Deterministic alphabetical key ordering by UTF-16 code units.
/// 3. Compact representation with zero insignificant whitespace.
/// 4. IEEE 754 float rendering without trailing zeros.
pub fn to_canonical_json_bytes<T: Serialize>(value: &T) -> Result<Vec<u8>, CoreError> {
    serde_json_canonicalizer::to_vec(value).map_err(|e| CoreError::Canonicalization(e.to_string()))
}

/// Serializes any serde Serializable value into RFC 8785 canonical JSON string.
pub fn to_canonical_json_string<T: Serialize>(value: &T) -> Result<String, CoreError> {
    serde_json_canonicalizer::to_string(value)
        .map_err(|e| CoreError::Canonicalization(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_canonical_json_no_whitespace_and_sorted_keys() {
        let value = json!({
            "zebra": 1,
            "apple": 2,
            "nested": {
                "charlie": "foo",
                "bravo": "bar"
            }
        });

        let canon_str = to_canonical_json_string(&value).unwrap();
        assert_eq!(
            canon_str,
            r#"{"apple":2,"nested":{"bravo":"bar","charlie":"foo"},"zebra":1}"#
        );
        assert!(!canon_str.contains(' '));
        assert!(!canon_str.contains('\n'));
        assert!(!canon_str.contains('\t'));
    }
}
