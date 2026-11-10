use sha1::{Digest, Sha1};

/// Computes a deterministic BitTorrent/WebTorrent-compatible Swarm InfoHash (40 hex chars).
///
/// Invariant: InfoHash = SHA1(geohash + ":" + epoch [ + ":" + owner_pk ])
pub fn compute_info_hash(geohash: &str, epoch: &str, owner_pk: Option<&str>) -> String {
    let mut base_str = format!("{}:{}", geohash, epoch);
    if let Some(pk) = owner_pk {
        if !pk.is_empty() {
            base_str.push(':');
            base_str.push_str(pk);
        }
    }

    let mut hasher = Sha1::new();
    hasher.update(base_str.as_bytes());
    let result = hasher.finalize();
    hex::encode(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_info_hash_deterministic() {
        let geohash = "69y7p";
        let epoch = "2026-11";
        let hash = compute_info_hash(geohash, epoch, None);
        assert_eq!(hash.len(), 40);

        // Run same computation via sha1 manually
        let mut hasher = Sha1::new();
        hasher.update(b"69y7p:2026-11");
        let expected = hex::encode(hasher.finalize());
        assert_eq!(hash, expected);
    }

    #[test]
    fn test_compute_info_hash_with_owner_pk() {
        let geohash = "69y7p";
        let epoch = "2026-11";
        let pk = "207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6";
        let hash = compute_info_hash(geohash, epoch, Some(pk));
        assert_eq!(hash.len(), 40);

        let mut hasher = Sha1::new();
        hasher.update(format!("69y7p:2026-11:{}", pk).as_bytes());
        let expected = hex::encode(hasher.finalize());
        assert_eq!(hash, expected);
    }
}
