use handshake_core::{
    compute_info_hash, AnchorProof, Attachment, Coordinates, CoreError, KeyPair, Message,
    MessageAnchor, MessageContent, MessageHeader, MAX_MESSAGE_SIZE,
};

const TEST_SEED_HEX: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const EXPECTED_PUBKEY_HEX: &str =
    "207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6";

#[test]
fn test_ed25519_vector_parity() {
    let keypair = KeyPair::from_seed_hex(TEST_SEED_HEX).expect("failed to load keypair from seed");
    assert_eq!(
        keypair.public_key_hex(),
        EXPECTED_PUBKEY_HEX,
        "Public key derived from test seed must match expected vector"
    );
    assert_eq!(keypair.seed_hex(), TEST_SEED_HEX);
}

#[test]
fn test_canonical_signing_data_exact_byte_match_with_python_and_web() {
    let msg = Message {
        version: "1.0".to_string(),
        header: MessageHeader {
            message_type: "PUBLIC".to_string(),
            owner_pk: None,
            author_pk: EXPECTED_PUBKEY_HEX.to_string(),
            parent_signature: None,
            signature: None,
        },
        anchor: MessageAnchor {
            timestamp: 1700000000,
            geohash: "6g3qc".to_string(),
            coordinates: None,
            proof: AnchorProof {
                proof_type: "NONE".to_string(),
                data: None,
            },
        },
        content: MessageContent {
            text: "Hello Strata Canonical Test!".to_string(),
            attachments: Vec::new(),
        },
    };

    let signing_bytes = msg.get_signing_data().expect("failed to get signing data");
    let signing_str = String::from_utf8(signing_bytes).expect("invalid utf-8");

    // Exact string expected from Python and Web canonicalization
    let expected_canonical_str = r#"{"anchor":{"geohash":"6g3qc","proof":{"data":null,"type":"NONE"},"timestamp":1700000000},"content":{"text":"Hello Strata Canonical Test!"},"header":{"author_pk":"207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6","owner_pk":null,"parent_signature":null,"type":"PUBLIC"},"version":"1.0"}"#;

    assert_eq!(
        signing_str, expected_canonical_str,
        "Rust canonical string must match Python and Web byte-for-byte"
    );
    assert!(!signing_str.contains(": "));
    assert!(!signing_str.contains(", "));
    assert!(!signing_str.contains('\n'));
}

#[test]
fn test_rust_verifies_python_signed_message() {
    let python_json = r#"{
        "version": "1.0",
        "header": {
            "type": "PUBLIC",
            "owner_pk": null,
            "author_pk": "207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6",
            "parent_signature": null,
            "signature": "cfd912ed3966d9f743b837e666f494582e5714783083365ac6150aa0f8d40f7edb883596eb11eb468af742e393bbea6acb1682676215bf3b9b4fbe67881edb09"
        },
        "anchor": {
            "timestamp": 1712345678,
            "geohash": "69y7p",
            "proof": {
                "type": "GPS",
                "data": "-34.608300,-58.371200"
            }
        },
        "content": {
            "text": "Buenos Aires Graffiti from Python"
        }
    }"#;

    let msg = Message::from_json_str(python_json).expect("failed to parse Python message");
    assert!(
        msg.verify().expect("verification errored"),
        "Rust core must verify message signed by Python cryptography"
    );

    // Tampering fails
    let mut tampered = msg.clone();
    tampered.content.text = "Buenos Aires Graffiti from Python (TAMPERED)".to_string();
    assert!(!tampered.verify().unwrap());
}

#[test]
fn test_message_sign_and_verify_cycle() {
    let keypair = KeyPair::from_seed_hex(TEST_SEED_HEX).unwrap();
    let mut msg = Message::new(
        keypair.public_key_hex(),
        "69y7p".to_string(),
        1712345678,
        "Buenos Aires Graffiti from Rust".to_string(),
    );

    assert_eq!(msg.header.signature, None);
    assert!(!msg.verify().unwrap(), "Unsigned message must not verify");

    let sig_hex = msg.sign(&keypair).expect("signing failed");
    assert_eq!(sig_hex.len(), 128);
    assert_eq!(
        sig_hex,
        "a5e533a0de7f618195f5aea37d6eb95a600023d4f8a2ea375a09d323ec9a13e770fbdb0fe69a7e85b41b0b2197ba3ff18f9cf6adccc872c57c11e35594fb480f",
        "Rust signature must match Python and TweetNaCl signature byte-for-byte"
    );
    assert_eq!(msg.header.signature, Some(sig_hex.clone()));

    assert!(msg.verify().expect("verification check failed"));

    // Tampering content text must fail verification
    let mut tampered = msg.clone();
    tampered.content.text = "Tampered message text".to_string();
    assert!(
        !tampered.verify().unwrap(),
        "Tampered message must fail verification"
    );

    // Tampering space-time coordinates must fail verification
    let mut tampered_loc = msg.clone();
    tampered_loc.anchor.geohash = "69y7q".to_string();
    assert!(
        !tampered_loc.verify().unwrap(),
        "Tampered location must fail verification"
    );

    // Tampering timestamp must fail verification
    let mut tampered_time = msg.clone();
    tampered_time.anchor.timestamp = 1712345679;
    assert!(
        !tampered_time.verify().unwrap(),
        "Tampered timestamp must fail verification"
    );
}

#[test]
fn test_closed_schema_enforcement_rejects_unknown_fields() {
    // 1. Unknown top-level field (Trojan injection attack)
    let payload_with_trojan = r#"{
        "version": "1.0",
        "header": {
            "type": "PUBLIC",
            "owner_pk": null,
            "author_pk": "207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6",
            "parent_signature": null
        },
        "anchor": {
            "timestamp": 1712345678,
            "geohash": "69y7p",
            "proof": { "type": "NONE", "data": null }
        },
        "content": { "text": "Valid text" },
        "malicious_trojan": "unexpected_payload"
    }"#;

    let res = Message::from_json_str(payload_with_trojan);
    assert!(
        res.is_err(),
        "Closed schema must reject unknown top-level field"
    );

    // 2. Unknown field inside header
    let payload_with_header_injection = r#"{
        "version": "1.0",
        "header": {
            "type": "PUBLIC",
            "owner_pk": null,
            "author_pk": "207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6",
            "parent_signature": null,
            "is_admin": true
        },
        "anchor": {
            "timestamp": 1712345678,
            "geohash": "69y7p",
            "proof": { "type": "NONE", "data": null }
        },
        "content": { "text": "Valid text" }
    }"#;

    let res2 = Message::from_json_str(payload_with_header_injection);
    assert!(
        res2.is_err(),
        "Closed schema must reject unknown header field"
    );
}

#[test]
fn test_strict_size_boundary_rejects_payloads_greater_than_64kb() {
    // 64 KB = 65,536 bytes
    let huge_text = "A".repeat(65 * 1024);
    let huge_payload = format!(
        r#"{{"version":"1.0","header":{{"author_pk":"{}","type":"PUBLIC","owner_pk":null,"parent_signature":null}},"anchor":{{"timestamp":1712345678,"geohash":"69y7p","proof":{{"type":"NONE","data":null}}}},"content":{{"text":"{}"}}}}"#,
        EXPECTED_PUBKEY_HEX, huge_text
    );

    assert!(huge_payload.len() > MAX_MESSAGE_SIZE);

    let res = Message::from_json_str(&huge_payload);
    match res {
        Err(CoreError::PayloadTooLarge { size, limit }) => {
            assert_eq!(limit, MAX_MESSAGE_SIZE);
            assert!(size > MAX_MESSAGE_SIZE);
        }
        other => panic!("Expected PayloadTooLarge error, got {:?}", other),
    }
}

#[test]
fn test_swarm_infohash_derivation_deterministic() {
    let geohash = "69y7p";
    let epoch = "2026-11";
    let hash = compute_info_hash(geohash, epoch, None);
    assert_eq!(hash.len(), 40);

    // Matches Python hashlib.sha1(b"69y7p:2026-11").hexdigest()
    assert_eq!(hash, "6cd371176f2e54b9c9f1cc9bdafaaea8cff7e728");

    // With owner_pk
    let hash_with_pk = compute_info_hash(geohash, epoch, Some(EXPECTED_PUBKEY_HEX));
    assert_eq!(hash_with_pk.len(), 40);
    // Matches Python hashlib.sha1(f"69y7p:2026-11:{EXPECTED_PUBKEY_HEX}".encode()).hexdigest()
    assert_eq!(hash_with_pk, "921226b2a2061748f257b4b3b3b907d7a693d267");
}

#[test]
fn test_replies_and_genealogical_thread_signing() {
    let keypair = KeyPair::from_seed_hex(TEST_SEED_HEX).unwrap();

    // 1. Root message
    let mut root = Message::new(
        keypair.public_key_hex(),
        "69y7p".to_string(),
        1712345678,
        "Root Graffiti in Obelisco".to_string(),
    );
    let root_sig = root.sign(&keypair).expect("root signing failed");
    assert!(root.verify().unwrap());

    // 2. Reply message with parent_signature pointing to root
    let mut reply = Message::new(
        keypair.public_key_hex(),
        "69y7p".to_string(),
        1712345700,
        "Reply to Root Graffiti".to_string(),
    );
    reply.header.parent_signature = Some(root_sig.clone());
    let reply_sig = reply.sign(&keypair).expect("reply signing failed");

    assert!(reply.verify().unwrap());
    assert_ne!(root_sig, reply_sig);
    assert_eq!(reply.header.parent_signature, Some(root_sig));
}

#[test]
fn test_coordinates_and_multimedia_attachments() {
    let keypair = KeyPair::from_seed_hex(TEST_SEED_HEX).unwrap();
    let mut msg = Message::new(
        keypair.public_key_hex(),
        "69y7p".to_string(),
        1712345678,
        "Graffiti with Photo".to_string(),
    );
    msg.anchor.coordinates = Some(Coordinates {
        lat: -34.6083,
        lon: -58.3712,
    });
    msg.anchor.proof = AnchorProof {
        proof_type: "GPS".to_string(),
        data: Some("-34.608300,-58.371200".to_string()),
    };
    msg.content.attachments.push(Attachment {
        url: "https://example.com/photo.webp".to_string(),
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
        mime_type: "image/webp".to_string(),
    });

    let sig = msg.sign(&keypair).expect("signing failed");
    assert!(msg.verify().unwrap());

    // Serialize and deserialize roundtrip
    let json_str = msg.to_json_string().unwrap();
    let parsed = Message::from_json_str(&json_str).unwrap();
    assert_eq!(parsed, msg);
    assert_eq!(parsed.header.signature, Some(sig));
    assert!(parsed.verify().unwrap());
}
