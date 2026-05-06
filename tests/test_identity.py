import pytest
import os
from strata.core.identity import IdentityManager, ContactBook
from cryptography.hazmat.primitives.asymmetric import ed25519


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
