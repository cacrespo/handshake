import os
import json
import logging
from typing import Optional, Dict
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization

logger = logging.getLogger("strata.identity")


class IdentityManager:
    """
    Manages the local user's Ed25519 identity.
    Handles key generation, storage, and retrieval.
    """

    def __init__(self, config_path: str = "~/.strata"):
        self.config_path = os.path.expanduser(config_path)
        self.identity_file = os.path.join(self.config_path, "identity.json")
        os.makedirs(self.config_path, exist_ok=True)

        self.private_key = None
        self.public_key = None
        self._load_or_create()

    def _load_or_create(self):
        """Loads identity from file or creates a new one if it doesn't exist."""
        if os.path.exists(self.identity_file):
            try:
                with open(self.identity_file, "r") as f:
                    data = json.load(f)
                    # Load Private Key (In a real app, this should be encrypted)
                    priv_bytes = bytes.fromhex(data["private_key"])
                    self.private_key = ed25519.Ed25519PrivateKey.from_private_bytes(
                        priv_bytes
                    )
                    self.public_key = self.private_key.public_key()
                    logger.info("Identity loaded from disk.")
                    return
            except Exception as e:
                logger.error(f"Error loading identity: {e}. Creating a new one.")

        # Create new identity
        self.private_key = ed25519.Ed25519PrivateKey.generate()
        self.public_key = self.private_key.public_key()
        self._save()
        logger.info("New identity created and saved.")

    def _save(self):
        """Saves identity to disk."""
        priv_bytes = self.private_key.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption(),
        )
        pub_bytes = self.public_key.public_bytes(
            encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
        )

        data = {"public_key": pub_bytes.hex(), "private_key": priv_bytes.hex()}

        # Ensure only the user can read this file
        with open(
            os.open(self.identity_file, os.O_CREAT | os.O_WRONLY, 0o600), "w"
        ) as f:
            json.dump(data, f)

    def get_public_key_hex(self) -> str:
        """Returns the public key as a hex string."""
        return self.public_key.public_bytes(
            encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
        ).hex()


class ContactBook:
    """
    Manages trusted contacts and their public keys.
    """

    def __init__(self, config_path: str = "~/.strata"):
        self.config_path = os.path.expanduser(config_path)
        self.contacts_file = os.path.join(self.config_path, "contacts.json")
        os.makedirs(self.config_path, exist_ok=True)
        self.contacts: Dict[str, str] = {}  # pk_hex -> alias
        self._load()

    def _load(self):
        if os.path.exists(self.contacts_file):
            with open(self.contacts_file, "r") as f:
                self.contacts = json.load(f)

    def _save(self):
        with open(self.contacts_file, "w") as f:
            json.dump(self.contacts, f, indent=2)

    def add_contact(self, public_key_hex: str, alias: str):
        self.contacts[public_key_hex] = alias
        self._save()

    def get_alias(self, public_key_hex: str) -> Optional[str]:
        return self.contacts.get(public_key_hex)
