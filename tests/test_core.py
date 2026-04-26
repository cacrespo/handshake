import pytest
from cryptography.hazmat.primitives.asymmetric import ed25519
from strata.core.models import Message
from strata.core.geo import get_geohash, generate_info_hash

def test_message_signing_and_verification():
    # 1. Generate keys
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    author_pk = public_key.public_bytes_raw()

    # 2. Create message
    msg = Message(
        author_pk=author_pk,
        geohash="6g3qc",
        content="Hello Strata!"
    )

    # 3. Sign
    msg.sign(private_key)
    assert msg.signature is not None

    # 4. Verify
    assert msg.verify() is True

    # 5. Tamper detection
    msg.content = "Hacked content"
    assert msg.verify() is False

def test_geo_logic():
    # Test geohash encoding (Plaza de Mayo, BA)
    lat, lon = -34.6083, -58.3712
    gh = get_geohash(lat, lon, precision=5)
    assert gh == "69y7p"

    # Test deterministic info_hash
    ih1 = generate_info_hash("69y7p", "2024-04")
    ih2 = generate_info_hash("69y7p", "2024-04")
    assert ih1 == ih2
    
    ih3 = generate_info_hash("69y7p", "2024-05")
    assert ih1 != ih3
