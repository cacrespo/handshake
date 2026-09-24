import json
import logging
import os
from typing import Any

from cryptography.hazmat.primitives.asymmetric import ed25519

logger = logging.getLogger("strata.identity")


def parse_private_key_bytes(key_source: str | dict[str, Any] | bytes) -> bytes:
    """Parses a private key seed from bytes, hex string, JSON string, dict, or file path.
    Supports both 32-byte private seeds and legacy 64-byte secret keys (seed + public key).
    Returns the 32-byte private key seed.
    """
    priv_bytes: bytes
    if isinstance(key_source, bytes):
        priv_bytes = key_source
    elif isinstance(key_source, dict):
        priv_hex = key_source.get("private_key") or key_source.get("secretKey") or key_source.get("privateKey")
        if not priv_hex:
            raise ValueError("No private key field found in key dictionary")
        priv_bytes = bytes.fromhex(priv_hex)
    elif isinstance(key_source, str):
        expanded = os.path.expanduser(key_source)
        if os.path.exists(expanded):
            with open(expanded, "r") as f:
                data = json.load(f)
            priv_hex = data.get("private_key") or data.get("secretKey") or data.get("privateKey")
            if not priv_hex:
                raise ValueError(f"No private key found in file '{key_source}'")
            priv_bytes = bytes.fromhex(priv_hex)
        else:
            try:
                data = json.loads(key_source)
                if isinstance(data, dict):
                    priv_hex = data.get("private_key") or data.get("secretKey") or data.get("privateKey")
                    if not priv_hex:
                        raise ValueError("No private key found in JSON string")
                    priv_bytes = bytes.fromhex(priv_hex)
                else:
                    priv_bytes = bytes.fromhex(str(data).strip())
            except (json.JSONDecodeError, ValueError):
                priv_bytes = bytes.fromhex(key_source.strip())
    else:
        raise ValueError(f"Unsupported key source type: {type(key_source)}")

    if len(priv_bytes) == 64:
        # Legacy 64-byte TweetNaCl secret key (32-byte seed + 32-byte public key)
        priv_bytes = priv_bytes[:32]
    elif len(priv_bytes) != 32:
        raise ValueError(f"Invalid private key length: {len(priv_bytes)} bytes (expected 32 or 64 bytes)")

    return priv_bytes


class IdentityManager:
    """
    Manages the local user's Ed25519 identity.
    Handles key generation, storage, import, export, and retrieval.
    """

    def __init__(self, config_path: str = "~/.strata"):
        self.config_path = os.path.expanduser(config_path)
        self.identity_file = os.path.join(self.config_path, "identity.json")
        os.makedirs(self.config_path, exist_ok=True)

        self.private_key: ed25519.Ed25519PrivateKey | None = None
        self.public_key: ed25519.Ed25519PublicKey | None = None
        self._load_or_create()

    def _load_or_create(self):
        """Loads identity from file or creates a new one if it doesn't exist."""
        if os.path.exists(self.identity_file):
            try:
                with open(self.identity_file, "r") as f:
                    data = json.load(f)
                    priv_bytes = parse_private_key_bytes(data)
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
        priv_bytes = self.private_key.private_bytes_raw()
        pub_bytes = self.public_key.public_bytes_raw()

        data = {"public_key": pub_bytes.hex(), "private_key": priv_bytes.hex()}

        # Ensure only the user can read this file
        fd = os.open(self.identity_file, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
        with open(fd, "w") as f:
            json.dump(data, f, indent=2)

    def get_public_key_hex(self) -> str:
        """Returns the public key as a hex string (64 characters)."""
        return self.public_key.public_bytes_raw().hex()

    def get_private_key_hex(self) -> str:
        """Returns the 32-byte private key seed as a hex string (64 characters)."""
        return self.private_key.private_bytes_raw().hex()

    def export_key(self, file_path: str | None = None) -> dict[str, str]:
        """
        Exports identity as a standardized dictionary with a 32-byte private seed (64 hex characters).
        Optionally saves to file_path if provided.
        """
        data = {
            "public_key": self.get_public_key_hex(),
            "private_key": self.get_private_key_hex(),
        }
        if file_path:
            expanded = os.path.expanduser(file_path)
            dirname = os.path.dirname(expanded)
            if dirname:
                os.makedirs(dirname, exist_ok=True)
            with open(expanded, "w") as f:
                json.dump(data, f, indent=2)
        return data

    def import_key(self, key_source: str | dict[str, Any] | bytes, save: bool = True) -> None:
        """
        Imports identity from a file path, JSON string, dict, hex string, or raw bytes.
        Supports both 32-byte private seeds (64 hex characters) and legacy 64-byte secret keys (128 hex characters).
        """
        priv_bytes = parse_private_key_bytes(key_source)
        self.private_key = ed25519.Ed25519PrivateKey.from_private_bytes(priv_bytes)
        self.public_key = self.private_key.public_key()
        if save:
            self._save()


class ContactBook:
    """
    Manages trusted contacts and their public keys.
    """

    def __init__(self, config_path: str = "~/.strata", owner_label: str = "Unknown"):
        self.config_path = os.path.expanduser(config_path)
        self.contacts_file = os.path.join(self.config_path, "contacts.json")
        self.owner_label = owner_label
        os.makedirs(self.config_path, exist_ok=True)
        self.contacts: dict[str, str] = {}  # pk_hex -> alias
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

    def get_alias(self, public_key_hex: str) -> str | None:
        alias = self.contacts.get(public_key_hex)
        logger.debug(
            f"[{self.owner_label}] Contact lookup: {public_key_hex[:8]} -> {alias}"
        )
        return alias
