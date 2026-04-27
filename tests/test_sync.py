import pytest
import json
from unittest.mock import MagicMock, patch
from strata.core.sync import SyncEngine
from strata.core.storage import StorageManager
from strata.core.models import Message
from cryptography.hazmat.primitives.asymmetric import ed25519

@pytest.fixture
def mock_storage(tmp_path):
    return StorageManager(base_path=str(tmp_path))

@pytest.fixture
def sync_engine(mock_storage):
    # We use a high port to avoid conflicts
    engine = SyncEngine(storage=mock_storage, port=9999)
    engine.sock = MagicMock() # Mock the socket to avoid real network calls
    return engine

def test_handle_inventory_requests_missing(sync_engine, mock_storage):
    # 1. Setup local storage with one message
    priv = ed25519.Ed25519PrivateKey.generate()
    msg_local = Message(author_pk=priv.public_key().public_bytes_raw(), geohash="abc", content="local")
    msg_local.sign(priv)
    info_hash = "abcdef1234567890abcdef1234567890abcdef12"
    mock_storage.save_message(info_hash, msg_local)
    
    # 2. Simulate receiving an inventory with a NEW hash
    remote_hashes = {msg_local.signature.hex()[:16], "remote_hash_123"}
    addr = ("127.0.0.1", 6882)
    
    with patch.object(sync_engine, '_send_request') as mock_send_request:
        sync_engine._handle_inventory("abc", remote_hashes, addr)
        
        # Should have requested the missing hash
        mock_send_request.assert_called_once_with(info_hash, "remote_hash_123", addr)

def test_handle_request_sends_data(sync_engine, mock_storage):
    # 1. Setup local storage
    priv = ed25519.Ed25519PrivateKey.generate()
    msg = Message(author_pk=priv.public_key().public_bytes_raw(), geohash="abc", content="target")
    msg.sign(priv)
    info_hash = "abcdef1234567890abcdef1234567890abcdef12"
    mock_storage.save_message(info_hash, msg)
    msg_hash = msg.signature.hex()[:16]
    
    addr = ("127.0.0.1", 6882)
    
    with patch.object(sync_engine, '_send_data') as mock_send_data:
        sync_engine._handle_request(info_hash, msg_hash, addr)
        
        # Should have sent the full message data
        mock_send_data.assert_called_once()
        sent_msg = mock_send_data.call_args[0][1]
        assert sent_msg.content == "target"

def test_handle_data_saves_valid_message(sync_engine, mock_storage):
    priv = ed25519.Ed25519PrivateKey.generate()
    msg = Message(author_pk=priv.public_key().public_bytes_raw(), geohash="abc", content="new_sync")
    msg.sign(priv)
    
    msg_data = msg.to_dict()
    msg_data["header"]["signature"] = msg.signature.hex()
    
    info_hash = "abcdef1234567890abcdef1234567890abcdef12"
    sync_engine._handle_data(info_hash, msg_data)
    
    # Verify it was saved to storage
    loaded = mock_storage.load_messages(info_hash)
    assert len(loaded) == 1
    assert loaded[0].content == "new_sync"
