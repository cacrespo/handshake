import json
import time
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric import ed25519

# Security constraint: Maximum allowed canonical message size (64 KB)
MAX_MESSAGE_SIZE: int = 64 * 1024


class Message:
    """
    Represents a single 'trace' or message in the Handshake ecosystem.
    This is the sovereign space-time trace designed to be serializable and verifiable.
    """

    def __init__(
        self,
        author_pk: bytes,
        geohash: str,
        content: str,
        message_type: str = "PUBLIC",
        owner_pk: bytes | None = None,
        parent_signature: bytes | None = None,
        timestamp: float | None = None,
        proof_type: str = "NONE",
        proof_data: str | None = None,
        signature: bytes | None = None,
        attachments: list[dict[str, Any]] | None = None,
        extra: dict[str, Any] | None = None,
    ):
        self.author_pk = author_pk
        self.geohash = geohash
        self.content = content
        self.message_type = message_type  # PUBLIC or ANCHORED
        self.owner_pk = owner_pk
        self.parent_signature = parent_signature
        self.timestamp = timestamp or time.time()
        self.proof_type = proof_type  # NONE, GPS, BT
        self.proof_data = proof_data
        self.signature = signature
        self.attachments = attachments or []
        self.extra = extra or {}

    def to_dict(self) -> dict[str, Any]:
        """Serializes the message for signing or storage according to the Handshake Protocol."""
        content_data: dict[str, Any] = {"text": self.content}
        if self.attachments:
            content_data["attachments"] = self.attachments
        elif self.extra and "attachments" in self.extra:
            content_data["attachments"] = self.extra["attachments"]

        data = {
            "version": "1.0",
            "header": {
                "type": self.message_type,
                "owner_pk": self.owner_pk.hex() if self.owner_pk else None,
                "author_pk": self.author_pk.hex(),
                "parent_signature": self.parent_signature.hex() if self.parent_signature else None,
            },
            "anchor": {
                "timestamp": int(self.timestamp),
                "geohash": self.geohash,
                "proof": {"type": self.proof_type, "data": self.proof_data},
            },
            "content": content_data,
        }
        return data

    def get_signing_data(self) -> bytes:
        """Returns the canonical JSON representation for signing (RFC 8785)."""
        data = self.to_dict()
        # Sign the complete structure excluding header.signature
        if "header" in data and "signature" in data["header"]:
            data = json.loads(json.dumps(data))
            data["header"].pop("signature", None)
        signing_bytes = json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")
        if len(signing_bytes) > MAX_MESSAGE_SIZE:
            raise ValueError(f"Message exceeds maximum allowed size of {MAX_MESSAGE_SIZE} bytes")
        return signing_bytes

    def sign(self, private_key: ed25519.Ed25519PrivateKey):
        """Signs the message using the author's private key."""
        self.signature = private_key.sign(self.get_signing_data())

    def verify(self) -> bool:
        """Verifies the message signature and ensures payload does not exceed MAX_MESSAGE_SIZE."""
        if not self.signature:
            return False
        try:
            signing_data = self.get_signing_data()
            if len(signing_data) > MAX_MESSAGE_SIZE:
                return False
            public_key = ed25519.Ed25519PublicKey.from_public_bytes(self.author_pk)
            public_key.verify(self.signature, signing_data)
            return True
        except (InvalidSignature, ValueError):
            return False

    def __repr__(self):
        return f"<HandshakeMessage [{self.geohash}] {self.content[:20]}...>"
