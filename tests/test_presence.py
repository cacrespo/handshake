import pytest
from unittest.mock import MagicMock, patch
import time
import struct
import hashlib
from strata.core.presence import PresenceBeacon, PresenceManager
from strata.core.identity import IdentityManager, ContactBook

def test_presence_beacon_serialization():
    pk_hash = b"12345678"
    nonce = 123456789
    sig = b"A" * 16
    
    beacon = PresenceBeacon(pubkey_hash=pk_hash, nonce=nonce, signature=sig)
    data = beacon.serialize()
    
    assert len(data) == 31
    assert data.startswith(b"ST")
    
    decoded = PresenceBeacon.deserialize(data)
    assert decoded.pubkey_hash == pk_hash
    assert decoded.nonce == nonce
    assert decoded.signature == sig

def test_presence_manager_discovery():
    # Setup mocks
    mock_identity = MagicMock()
    # Mock public_key object which has public_bytes method
    mock_pub_key = MagicMock()
    mock_pub_key.public_bytes.return_value = b"PUBKEY_BYTES"
    mock_identity.public_key = mock_pub_key
    # Mock private_key for signing
    mock_priv_key = MagicMock()
    mock_priv_key.sign.return_value = b"X" * 64
    mock_identity.private_key = mock_priv_key
    
    mock_contacts = MagicMock(spec=ContactBook)
    peer_pk_bytes = b"0" * 32
    pk_hex = peer_pk_bytes.hex()
    mock_contacts.contacts = {pk_hex: "Alice"}
    mock_contacts.get_alias.return_value = "Alice"
    
    mock_ble = MagicMock()
    
    pm = PresenceManager(mock_identity, mock_contacts, ble_hal=mock_ble)
    pm.start()
    
    # Simulate finding a device
    peer_hash = hashlib.sha256(peer_pk_bytes).digest()[:8]
    peer_nonce = int(time.time())
    peer_sig = b"S" * 16
    
    beacon = PresenceBeacon(pubkey_hash=peer_hash, nonce=peer_nonce, signature=peer_sig)
    
    # Call the internal callback
    pm._on_device_found("AA:BB:CC:DD:EE:FF", -60, beacon.serialize())
    
    peers = pm.get_nearby_peers()
    assert len(peers) == 1
    assert peers[0]["alias"] == "Alice"
    assert peers[0]["proximity"] == "Near"
    assert peers[0]["pk_hex"] == pk_hex

def test_presence_manager_proximity_labels():
    pm = PresenceManager(MagicMock(), MagicMock(), ble_hal=MagicMock())
    
    assert pm._get_proximity_label(-30) == "Immediate"
    assert pm._get_proximity_label(-60) == "Near"
    assert pm._get_proximity_label(-80) == "Far"
