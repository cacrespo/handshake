import pytest
import time
import os
import shutil
from cryptography.hazmat.primitives.asymmetric import ed25519
from strata.core.engine import StrataEngine
from strata.core.models import Message
from strata.core.geo import get_geohash

@pytest.fixture
def clean_storage():
    storage_alice = "./test_storage_alice"
    storage_bob = "./test_storage_bob"
    for path in [storage_alice, storage_bob]:
        if os.path.exists(path):
            shutil.rmtree(path)
    yield storage_alice, storage_bob
    for path in [storage_alice, storage_bob]:
        if os.path.exists(path):
            shutil.rmtree(path)

def test_engine_integration_sync(clean_storage):
    storage_alice, storage_bob = clean_storage
    
    # Coordinates for a test location
    lat, lon = 40.4167, -3.7033 # Madrid
    geohash = get_geohash(lat, lon, 7)
    
    # 1. Setup Alice's Engine
    engine_alice = StrataEngine(storage_path=storage_alice, gossip_port=10001, p2p_port=10002)
    engine_alice.start(lat, lon)
    
    # 2. Alice writes a message
    priv_a = ed25519.Ed25519PrivateKey.generate()
    msg_a = Message(
        author_pk=priv_a.public_key().public_bytes_raw(),
        geohash=geohash,
        content="Hello from Alice's engine"
    )
    msg_a.sign(priv_a)
    engine_alice.post_message(msg_a)
    
    from strata.core.geo import get_epoch_string, generate_info_hash
    epoch = get_epoch_string()
    info_hash = generate_info_hash(geohash, epoch)
    print(f"DEBUG: Geohash={geohash}, Epoch={epoch}, InfoHash={info_hash}")

    # 3. Setup Bob's Engine
    engine_bob = StrataEngine(storage_path=storage_bob, gossip_port=10003, p2p_port=10004)
    # Enable debug logging for the test
    import logging
    logging.getLogger("strata.sync").setLevel(logging.DEBUG)
    
    engine_bob.start(lat, lon)
    
    # 4. Manually bridge them for the test (since broadcast might not work in all CI environments)
    engine_bob.sync.add_peer("127.0.0.1", port=10001)
    
    # 5. Wait for sync
    max_retries = 15
    found = False
    for i in range(max_retries):
        messages = engine_bob.get_messages(lat, lon)
        print(f"Retry {i}: Bob has {len(messages)} messages")
        if any(m.content == "Hello from Alice's engine" for m in messages):
            found = True
            break
        time.sleep(1)
    
    # Cleanup
    engine_alice.stop()
    engine_bob.stop()
    
    assert found, "Bob should have received Alice's message through the engine sync"
