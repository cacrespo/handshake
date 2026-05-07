import pytest
import time
import os
import shutil
import logging
from strata.core.engine import StrataEngine


@pytest.fixture
def clean_config():
    config_alice = "./test_config_alice"
    config_bob = "./test_config_bob"
    for path in [config_alice, config_bob]:
        if os.path.exists(path):
            shutil.rmtree(path)
    yield config_alice, config_bob
    for path in [config_alice, config_bob]:
        if os.path.exists(path):
            shutil.rmtree(path)


def test_handshake_flow(clean_config, caplog):
    config_alice, config_bob = clean_config
    caplog.set_level(logging.INFO)

    # 1. Alice starts engine
    engine_alice = StrataEngine(config_path=config_alice, gossip_port=11001)
    engine_alice.sync.start()
    alice_pk = engine_alice.identity.get_public_key_hex()

    # 2. Bob starts engine
    engine_bob = StrataEngine(config_path=config_bob, gossip_port=11002)
    engine_bob.sync.start()

    # 3. Alice sends handshake
    engine_alice.sync.send_handshake(engine_alice.identity)

    # 4. Give Bob time to receive and process
    time.sleep(1)

    # 5. Check Bob's logs
    assert any(
        f"Validated Handshake received from {alice_pk[:8]}" in record.message
        for record in caplog.records
    )

    # Cleanup
    engine_alice.stop()
    engine_bob.stop()
