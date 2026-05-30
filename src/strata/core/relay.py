import os
import json
import logging
from typing import Set

logger = logging.getLogger("strata.relay")


class RelayManager:
    """
    Manages the list of swarms (InfoHashes) the user wants to seed persistently
    as 'Social Relays'.
    """

    def __init__(self, config_path: str = "~/.strata"):
        self.config_path = os.path.expanduser(config_path)
        self.relay_file = os.path.join(self.config_path, "relays.json")
        os.makedirs(self.config_path, exist_ok=True)

        self.relays: Set[str] = set()
        self._load()

    def _load(self):
        """Loads relay list from file."""
        if os.path.exists(self.relay_file):
            try:
                with open(self.relay_file, "r") as f:
                    data = json.load(f)
                    self.relays = set(data.get("info_hashes", []))
                    logger.info(f"Loaded {len(self.relays)} relays from disk.")
            except Exception as e:
                logger.error(f"Error loading relays: {e}")

    def _save(self):
        """Saves relay list to disk."""
        try:
            with open(self.relay_file, "w") as f:
                json.dump({"info_hashes": list(self.relays)}, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving relays: {e}")

    def add_relay(self, info_hash: str):
        """Adds a swarm to the relay list."""
        if info_hash not in self.relays:
            self.relays.add(info_hash)
            self._save()
            logger.info(f"Added relay for {info_hash}")

    def remove_relay(self, info_hash: str):
        """Removes a swarm from the relay list."""
        if info_hash in self.relays:
            self.relays.remove(info_hash)
            self._save()
            logger.info(f"Removed relay for {info_hash}")

    def is_relaying(self, info_hash: str) -> bool:
        """Checks if an info_hash is being relayed."""
        return info_hash in self.relays
