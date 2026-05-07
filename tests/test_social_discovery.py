import pytest
import time
import os
import shutil
import logging
from strata.core.engine import StrataEngine
from strata.core.geo import get_geohash, get_epoch_string, generate_info_hash


@pytest.fixture
def clean_env():
    c_a = "./test_config_alice_social"
    c_b = "./test_config_bob_social"
    s_a = "./test_storage_alice_social"
    s_b = "./test_storage_bob_social"
    for p in [c_a, c_b, s_a, s_b]:
        if os.path.exists(p):
            shutil.rmtree(p)
    yield c_a, c_b, s_a, s_b
    for p in [c_a, c_b, s_a, s_b]:
        if os.path.exists(p):
            shutil.rmtree(p)


def test_social_discovery_flow(clean_env, caplog):
    config_a, config_b, storage_a, storage_b = clean_env
    caplog.set_level(logging.DEBUG)

    # 1. Setup Alice: She relays Madrid while being in Barcelona
    engine_a = StrataEngine(
        storage_path=storage_a, config_path=config_a, gossip_port=12001
    )
    madrid_hash = generate_info_hash(get_geohash(40.41, -3.70, 7), get_epoch_string())
    engine_a.start_relay(madrid_hash)

    # Alice starts in Barcelona
    engine_a.start(41.38, 2.17)
    alice_pk = engine_a.identity.get_public_key_hex()

    # 2. Setup Bob: Starts in Barcelona
    engine_b = StrataEngine(
        storage_path=storage_b, config_path=config_b, gossip_port=12002
    )
    # Bob must trust Alice for social discovery to work
    engine_b.contacts.add_contact(alice_pk, "Alice")
    engine_b.start(41.38, 2.17)

    # 3. Manually bridge them
    engine_b.sync.add_peer("127.0.0.1", port=12001)

    # 4. Wait for sync and discovery
    time.sleep(2)

    # 5. Stop engines
    engine_a.stop()
    engine_b.stop()

    # 6. Verify logs
    assert any(
        "Trust Link: Connected to contact 'Alice'" in record.message
        for record in caplog.records
    )
    assert any(
        "Social Discovery: 'Alice' is relaying 1 distant boards." in record.message
        for record in caplog.records
    )

    # 7. Verify Alice's relayed swarm was joined by Bob
    # We expect Bob's engine_b to have the relay swarm in active_info_hashes
    assert madrid_hash in engine_b.active_info_hashes
