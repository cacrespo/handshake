import os

import pytest
from cryptography.hazmat.primitives.asymmetric import ed25519

from strata.core.identity import ContactBook, IdentityManager


@pytest.fixture
def temp_config(tmp_path):
    return str(tmp_path / ".strata")


def test_identity_manager_creation_and_persistence(temp_config):
    # 1. Create a new identity
    im = IdentityManager(config_path=temp_config)
    pk_hex = im.get_public_key_hex()
    assert len(pk_hex) == 64
    assert os.path.exists(os.path.join(temp_config, "identity.json"))

    # 2. Reload identity from the same path
    im2 = IdentityManager(config_path=temp_config)
    assert im2.get_public_key_hex() == pk_hex
    assert im2.private_key.private_bytes_raw() == im.private_key.private_bytes_raw()


def test_contact_book_management(temp_config):
    cb = ContactBook(config_path=temp_config)

    # Generate a dummy public key
    dummy_pk = ed25519.Ed25519PrivateKey.generate().public_key()
    dummy_pk_hex = dummy_pk.public_bytes_raw().hex()

    # 1. Add contact
    cb.add_contact(dummy_pk_hex, "Alice")
    assert cb.get_alias(dummy_pk_hex) == "Alice"
    assert os.path.exists(os.path.join(temp_config, "contacts.json"))

    # 2. Persist and reload
    cb2 = ContactBook(config_path=temp_config)
    assert cb2.get_alias(dummy_pk_hex) == "Alice"


def test_identity_manager_corrupted_file(temp_config):
    os.makedirs(temp_config, exist_ok=True)
    identity_file = os.path.join(temp_config, "identity.json")
    with open(identity_file, "w") as f:
        f.write("corrupted data")

    # Should handle error and create a new one
    im = IdentityManager(config_path=temp_config)
    assert im.public_key is not None
    assert im.get_public_key_hex() is not None


def test_identity_export_and_import(temp_config, tmp_path):
    im = IdentityManager(config_path=temp_config)
    exported = im.export_key()
    assert "public_key" in exported
    assert "private_key" in exported
    assert len(exported["public_key"]) == 64
    assert len(exported["private_key"]) == 64

    # Export to a .key file
    key_file = str(tmp_path / "test_identity.key")
    im.export_key(file_path=key_file)
    assert os.path.exists(key_file)

    # Import in a fresh IdentityManager instance
    temp_config2 = str(tmp_path / ".strata2")
    im2 = IdentityManager(config_path=temp_config2)
    assert im2.get_public_key_hex() != im.get_public_key_hex()

    im2.import_key(key_file)
    assert im2.get_public_key_hex() == im.get_public_key_hex()
    assert im2.get_private_key_hex() == im.get_private_key_hex()


def test_identity_legacy_64byte_secret_key_import(temp_config, tmp_path):
    im = IdentityManager(config_path=temp_config)
    priv_seed = im.private_key.private_bytes_raw()
    pub_bytes = im.public_key.public_bytes_raw()
    # TweetNaCl legacy 64-byte format: seed (32 bytes) + public key (32 bytes)
    legacy_64byte_key = priv_seed + pub_bytes
    assert len(legacy_64byte_key) == 64
    legacy_hex = legacy_64byte_key.hex()
    assert len(legacy_hex) == 128

    # Import legacy 64-byte key as dict
    im_legacy = IdentityManager(config_path=str(tmp_path / ".strata_legacy"))
    im_legacy.import_key({"private_key": legacy_hex})
    assert im_legacy.get_public_key_hex() == im.get_public_key_hex()
    assert im_legacy.get_private_key_hex() == im.get_private_key_hex()

    # Import legacy 64-byte key as raw hex string
    im_legacy2 = IdentityManager(config_path=str(tmp_path / ".strata_legacy2"))
    im_legacy2.import_key(legacy_hex)
    assert im_legacy2.get_public_key_hex() == im.get_public_key_hex()

    # Invalid lengths should raise ValueError
    with pytest.raises(ValueError, match="Invalid private key length"):
        im_legacy.import_key("abcdef")
