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

def test_storage_manager(tmp_path):
    from strata.core.storage import StorageManager
    import os

    # 1. Setup
    storage = StorageManager(base_path=str(tmp_path))
    info_hash = "abcdef1234567890abcdef1234567890abcdef12" # Valid hex
    
    priv = ed25519.Ed25519PrivateKey.generate()
    author_pk = priv.public_key().public_bytes_raw()
    
    msg = Message(author_pk=author_pk, geohash="6g3qc", content="Storage Test")
    msg.sign(priv)

    # 2. Save
    path = storage.save_message(info_hash, msg)
    assert os.path.exists(path)

    # 3. Load and Verify
    loaded_messages = storage.load_messages(info_hash)
    assert len(loaded_messages) == 1
    assert loaded_messages[0].content == "Storage Test"
    assert loaded_messages[0].verify() is True
