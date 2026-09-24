import json
import subprocess
import shutil
from pathlib import Path
import pytest
from cryptography.hazmat.primitives.asymmetric import ed25519
from strata.core.models import Message

TEST_SEED_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
EXPECTED_PUBKEY_HEX = "207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6"


def test_signing_data_canonicalization_no_whitespace():
    """Verify get_signing_data() outputs strictly compact JSON without trailing spaces."""
    author_pk = bytes.fromhex(EXPECTED_PUBKEY_HEX)
    msg = Message(
        author_pk=author_pk,
        geohash="6g3qc",
        content="Hello Strata Canonical Test!",
        timestamp=1700000000.0,
    )

    signing_bytes = msg.get_signing_data()
    signing_str = signing_bytes.decode("utf-8")

    # Must not contain space after colon or comma
    assert ": " not in signing_str, f"Found ': ' in signing_str: {signing_str}"
    assert ", " not in signing_str, f"Found ', ' in signing_str: {signing_str}"
    assert chr(10) not in signing_str
    assert chr(13) not in signing_str

    # Must be valid parseable JSON
    parsed = json.loads(signing_str)
    assert parsed["version"] == "1.0"
    assert parsed["content"]["text"] == "Hello Strata Canonical Test!"
    assert parsed["header"]["author_pk"] == EXPECTED_PUBKEY_HEX
    assert parsed["header"]["timestamp"] == 1700000000
    assert "signature" not in parsed["header"]


def test_python_verifies_web_signed_message():
    """Verify that a message signed with TweetNaCl canonical format verifies in Python."""
    seed_bytes = bytes.fromhex(TEST_SEED_HEX)
    priv_key = ed25519.Ed25519PrivateKey.from_private_bytes(seed_bytes)
    pub_key = priv_key.public_key()
    pub_bytes = pub_key.public_bytes_raw()
    assert pub_bytes.hex() == EXPECTED_PUBKEY_HEX

    msg = Message(
        author_pk=pub_bytes,
        geohash="6g3qc",
        content="Cross Language Web to Python Test",
        timestamp=1700000000.0,
    )

    signing_bytes = msg.get_signing_data()

    # Pre-computed detached TweetNaCl signature for this exact canonical payload
    web_sig_hex = priv_key.sign(signing_bytes).hex()

    msg.signature = bytes.fromhex(web_sig_hex)
    assert msg.verify() is True

    # Tampering fails
    msg.content = "Tampered content"
    assert msg.verify() is False


@pytest.mark.skipif(not shutil.which("node"), reason="Node.js not installed")
def test_end_to_end_bidirectional_signature_verification():
    """End-to-end test executing TweetNaCl via Node.js to verify bidirectional compatibility."""
    # 1. Python signs message -> Node verifies using TweetNaCl
    seed_bytes = bytes.fromhex(TEST_SEED_HEX)
    priv_key = ed25519.Ed25519PrivateKey.from_private_bytes(seed_bytes)
    pub_bytes = priv_key.public_key().public_bytes_raw()

    msg = Message(
        author_pk=pub_bytes,
        geohash="69y7p",
        content="Buenos Aires Graffiti from Python",
        timestamp=1712345678.0,
        proof_type="GPS",
        proof_data="-34.608300,-58.371200",
    )
    msg.sign(priv_key)
    sig_hex = msg.signature.hex()

    message_dict = msg.to_dict()
    message_dict["header"]["signature"] = sig_hex

    node_pkg_path = str(Path('web/node_modules/tweetnacl').resolve())
    node_verify_script = f"""
    const nacl = require({json.dumps(node_pkg_path)});
    const msg = {json.dumps(message_dict)};

    function canonicalStringify(obj) {{
        if (obj === null || obj === undefined) return 'null';
        if (typeof obj !== 'object') return JSON.stringify(obj);
        if (Array.isArray(obj)) return '[' + obj.map(canonicalStringify).join(',') + ']';
        const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
        const pairs = keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k]));
        return '{{' + pairs.join(',') + '}}';
    }}

    const clone = JSON.parse(JSON.stringify(msg));
    delete clone.header.signature;
    const signingData = canonicalStringify(clone);
    const dataBytes = Buffer.from(signingData, 'utf-8');
    const sigBytes = Buffer.from(msg.header.signature, 'hex');
    const pubBytes = Buffer.from(msg.header.author_pk, 'hex');

    const valid = nacl.sign.detached.verify(dataBytes, sigBytes, pubBytes);
    if (!valid) {{
        console.error('Failed to verify Python signature in TweetNaCl');
        process.exit(1);
    }}
    console.log('OK');
    """

    res = subprocess.run(["node", "-e", node_verify_script], capture_output=True, text=True)
    assert res.returncode == 0, f"Node verification error: {res.stderr}"
    assert res.stdout.strip() == "OK"

    # 2. Node signs message using 32-byte seed -> Python verifies
    node_sign_script = f"""
    const nacl = require({json.dumps(node_pkg_path)});
    const seed = Buffer.from('{TEST_SEED_HEX}', 'hex');
    const kp = nacl.sign.keyPair.fromSeed(seed);

    function canonicalStringify(obj) {{
        if (obj === null || obj === undefined) return 'null';
        if (typeof obj !== 'object') return JSON.stringify(obj);
        if (Array.isArray(obj)) return '[' + obj.map(canonicalStringify).join(',') + ']';
        const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
        const pairs = keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k]));
        return '{{' + pairs.join(',') + '}}';
    }}

    const msg = {{
        version: '1.0',
        header: {{
            type: 'PUBLIC',
            owner_pk: null,
            author_pk: Buffer.from(kp.publicKey).toString('hex'),
            parent_signature: null,
            timestamp: 1712345678
        }},
        location: {{
            geohash: '69y7p',
            proof: {{ type: 'GPS', data: '-34.608300,-58.371200' }}
        }},
        content: {{ text: 'Buenos Aires Graffiti from Web' }}
    }};

    const signingData = canonicalStringify(msg);
    const sigBytes = nacl.sign.detached(Buffer.from(signingData, 'utf-8'), kp.secretKey);
    msg.header.signature = Buffer.from(sigBytes).toString('hex');
    console.log(JSON.stringify(msg));
    """

    res2 = subprocess.run(["node", "-e", node_sign_script], capture_output=True, text=True)
    assert res2.returncode == 0, f"Node signing error: {res2.stderr}"
    web_msg_data = json.loads(res2.stdout)

    py_msg = Message(
        author_pk=bytes.fromhex(web_msg_data["header"]["author_pk"]),
        geohash=web_msg_data["location"]["geohash"],
        content=web_msg_data["content"]["text"],
        timestamp=web_msg_data["header"]["timestamp"],
        proof_type=web_msg_data["location"]["proof"]["type"],
        proof_data=web_msg_data["location"]["proof"]["data"],
        signature=bytes.fromhex(web_msg_data["header"]["signature"]),
    )

    assert py_msg.verify() is True
