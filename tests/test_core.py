from cryptography.hazmat.primitives.asymmetric import ed25519
from strata.core.models import Message
from strata.core.geo import get_geohash, generate_info_hash


def test_message_signing_and_verification():
    # 1. Generate keys
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    author_pk = public_key.public_bytes_raw()

    # 2. Create message
    msg = Message(author_pk=author_pk, geohash="6g3qc", content="Hello Strata!")

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
    info_hash = "abcdef1234567890abcdef1234567890abcdef12"  # Valid hex

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


def test_storage_metabolism_and_keep(tmp_path):
    from strata.core.storage import StorageManager
    import time

    # Setup with a very small limit: 2 messages
    storage = StorageManager(base_path=str(tmp_path), max_messages_per_swarm=2)
    info_hash = "36dc1f1a39b536bbaa4535835a1cac573632be6e"

    priv = ed25519.Ed25519PrivateKey.generate()
    author_pk = priv.public_key().public_bytes_raw()

    # 1. Save 3 messages
    for i in range(3):
        msg = Message(
            author_pk=author_pk,
            geohash="6g3qc",
            content=f"Msg {i}",
            timestamp=time.time() + i,
        )
        msg.sign(priv)
        storage.save_message(info_hash, msg)

    # 2. Verify only 2 remain (Metabolism worked)
    loaded = storage.load_messages(info_hash)
    assert len(loaded) == 2
    # The oldest (Msg 0) should be gone, Msg 1 and Msg 2 remain
    assert any(m.content == "Msg 1" for m in loaded)
    assert any(m.content == "Msg 2" for m in loaded)
    assert not any(m.content == "Msg 0" for m in loaded)

    # 3. Test KEEP mechanism
    # Reset storage, save Msg 3, mark it KEEP, then save 2 more
    storage = StorageManager(base_path=str(tmp_path), max_messages_per_swarm=2)

    msg_keep = Message(
        author_pk=author_pk,
        geohash="6g3qc",
        content="Keep Me",
        timestamp=time.time() - 100,
    )
    msg_keep.sign(priv)
    keep_path = storage.save_message(info_hash, msg_keep)
    storage.mark_to_keep(keep_path)

    for i in range(2):
        msg = Message(
            author_pk=author_pk,
            geohash="6g3qc",
            content=f"Extra {i}",
            timestamp=time.time() + i,
        )
        msg.sign(priv)
        storage.save_message(info_hash, msg)

    # Total messages should be 3 (2 limit + 1 kept) because metabolism ignores .keep
    loaded = storage.load_messages(info_hash)
    assert len(loaded) == 3
    assert any(m.content == "Keep Me" for m in loaded)
