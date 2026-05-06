import pytest
from unittest.mock import MagicMock, patch
from cryptography.hazmat.primitives.asymmetric import ed25519
from strata.core.sync import SyncEngine
from strata.core.storage import StorageManager
from strata.core.models import Message


@pytest.fixture
def mock_storage(tmp_path):
    return StorageManager(base_path=str(tmp_path))


@pytest.fixture
def sync_engine(mock_storage):
    engine = SyncEngine(storage=mock_storage, port=9999)
    # We mock the socket so it doesn't try to touch the real network
    engine.sock = MagicMock()
    return engine


def test_handle_inventory_requests_missing(sync_engine, mock_storage):
    # 1. Setup local storage with one message
    priv = ed25519.Ed25519PrivateKey.generate()
    msg_local = Message(
        author_pk=priv.public_key().public_bytes_raw(), geohash="abc", content="local"
    )
    msg_local.sign(priv)
    info_hash = "36dc1f1a39b536bbaa4535835a1cac573632be6e"
    mock_storage.save_message(info_hash, msg_local)

    # 2. Simulate receiving an inventory with a NEW hash
    remote_hashes = {msg_local.signature.hex()[:16], "remote_hash_123"}
    addr = ("127.0.0.1", 6882)

    # We patch _send_request to see if it's called
    with patch.object(sync_engine, "_send_request") as mock_send_request:
        sync_engine._handle_inventory("abc", info_hash, remote_hashes, addr)

        # Success: It should have noticed "remote_hash_123" is missing and requested it
        mock_send_request.assert_called_once_with(info_hash, "remote_hash_123", addr)


def test_handle_request_sends_data(sync_engine, mock_storage):
    # 1. Setup local storage with a target message
    priv = ed25519.Ed25519PrivateKey.generate()
    msg = Message(
        author_pk=priv.public_key().public_bytes_raw(), geohash="abc", content="target"
    )
    msg.sign(priv)
    info_hash = "36dc1f1a39b536bbaa4535835a1cac573632be6e"
    mock_storage.save_message(info_hash, msg)
    msg_hash = msg.signature.hex()[:16]

    addr = ("127.0.0.1", 6882)

    # When someone requests that hash, we should send the data
    with patch.object(sync_engine, "_send_data") as mock_send_data:
        sync_engine._handle_request(info_hash, msg_hash, addr)

        mock_send_data.assert_called_once()
        sent_msg = mock_send_data.call_args[0][1]
        assert sent_msg.content == "target"


def test_handle_data_saves_valid_message(sync_engine, mock_storage):
    # Simulate receiving a valid data packet
    priv = ed25519.Ed25519PrivateKey.generate()
    msg = Message(
        author_pk=priv.public_key().public_bytes_raw(),
        geohash="abc",
        content="new_sync",
    )
    msg.sign(priv)

    msg_data = msg.to_dict()
    msg_data["header"]["signature"] = msg.signature.hex()

    info_hash = "36dc1f1a39b536bbaa4535835a1cac573632be6e"
    sync_engine._handle_data(info_hash, msg_data)

    # Verify it was saved correctly
    loaded = mock_storage.load_messages(info_hash)
    assert len(loaded) == 1
    assert loaded[0].content == "new_sync"


def test_handle_data_ignores_invalid_signature(sync_engine, mock_storage):
    # Simulate receiving a message with a corrupted signature
    priv = ed25519.Ed25519PrivateKey.generate()
    msg = Message(
        author_pk=priv.public_key().public_bytes_raw(), geohash="abc", content="fake"
    )
    # No signature or wrong signature
    msg_data = msg.to_dict()
    msg_data["header"]["signature"] = "00" * 64

    info_hash = "36dc1f1a39b536bbaa4535835a1cac573632be6e"
    sync_engine._handle_data(info_hash, msg_data)

    # Should be empty
    assert len(mock_storage.load_messages(info_hash)) == 0
