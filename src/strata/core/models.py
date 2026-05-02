import json
import time
from typing import Optional, Dict, Any
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.exceptions import InvalidSignature


class Message:
    """
    Represents a single 'trace' or message in the Strata ecosystem.
    This is the 'DNA' of the system, designed to be serializable and verifiable.
    """

    def __init__(
        self,
        author_pk: bytes,
        geohash: str,
        content: str,
        message_type: str = "PUBLIC",
        owner_pk: Optional[bytes] = None,
        timestamp: Optional[float] = None,
        proof_type: str = "NONE",
        proof_data: Optional[str] = None,
        signature: Optional[bytes] = None,
    ):
        self.author_pk = author_pk
        self.geohash = geohash
        self.content = content
        self.message_type = message_type  # PUBLIC or ANCHORED
        self.owner_pk = owner_pk
        self.timestamp = timestamp or time.time()
        self.proof_type = proof_type  # NONE, GPS, BT
        self.proof_data = proof_data
        self.signature = signature

    def to_dict(self) -> Dict[str, Any]:
        """Serializes the message for signing or storage."""
        return {
            "version": "1.0",
            "header": {
                "type": self.message_type,
                "owner_pk": self.owner_pk.hex() if self.owner_pk else None,
                "author_pk": self.author_pk.hex(),
                "timestamp": int(self.timestamp),
            },
            "location": {
                "geohash": self.geohash,
                "proof": {"type": self.proof_type, "data": self.proof_data},
            },
            "content": {"text": self.content},
        }

    def get_signing_data(self) -> bytes:
        """Returns the canonical JSON representation for signing."""
        data = self.to_dict()
        # We sign the whole structure except the signature field itself
        return json.dumps(data, sort_keys=True).encode("utf-8")

    def sign(self, private_key: ed25519.Ed25519PrivateKey):
        """Signs the message using the author's private key."""
        self.signature = private_key.sign(self.get_signing_data())

    def verify(self) -> bool:
        """Verifies the message signature."""
        if not self.signature:
            return False
        try:
            public_key = ed25519.Ed25519PublicKey.from_public_bytes(self.author_pk)
            public_key.verify(self.signature, self.get_signing_data())
            return True
        except InvalidSignature:
            return False

    def __repr__(self):
        return f"<StrataMessage [{self.geohash}] {self.content[:20]}...>"
