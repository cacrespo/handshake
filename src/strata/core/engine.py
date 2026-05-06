import time
import logging
import threading
from typing import List
from strata.core.storage import StorageManager
from strata.core.swarm import SwarmManager
from strata.core.sync import SyncEngine
from strata.core.models import Message
from strata.core.geo import get_geohash, get_epoch_string, generate_info_hash
from strata.core.identity import IdentityManager, ContactBook

logger = logging.getLogger("strata.engine")


class StrataEngine:
    """
    The central orchestrator of the Strata node.
    It unifies Gossip (local) and BitTorrent (global) transports.
    """

    def __init__(
        self,
        storage_path: str = "./storage",
        config_path: str = "~/.strata",
        gossip_port: int = 6882,
        p2p_port: int = 6881,
    ):
        self.storage = StorageManager(storage_path)
        self.swarm = SwarmManager(storage_path=storage_path, p2p_port=p2p_port)
        self.sync = SyncEngine(self.storage, port=gossip_port)
        self.identity = IdentityManager(config_path=config_path)
        self.contacts = ContactBook(config_path=config_path)

        self.active_info_hashes = set()
        self.running = False

    def start(self, lat: float, lon: float, precision: int = 7):
        """Starts the engine for a specific location."""
        geohash = get_geohash(lat, lon, precision)
        epoch = get_epoch_string()
        info_hash = generate_info_hash(geohash, epoch)

        self.active_info_hashes.add(info_hash)

        # 1. Start Global Seeding (BitTorrent)
        self.swarm.start_swarm(info_hash)

        # 2. Start Local Sync (Gossip)
        self.sync.start()

        self.running = True

        # 3. Start Bridge Thread
        self.bridge_thread = threading.Thread(target=self._bridge_loop, daemon=True)
        self.bridge_thread.start()

        logger.info(f"StrataEngine active for {geohash} ({info_hash})")

    def _bridge_loop(self):
        """Periodically bridges BitTorrent discovery to Gossip."""
        while self.running:
            try:
                self.bridge_discovery()
            except Exception as e:
                logger.error(f"Bridge error: {e}")
            time.sleep(10)

    def post_message(self, message: Message):
        """
        Broadcasts a message through all available channels.
        1. Saves locally.
        2. Gossip will pick it up in the next broadcast loop.
        3. BitTorrent will see the new file and seed it.
        """
        info_hash = generate_info_hash(message.geohash, get_epoch_string())
        self.storage.save_message(info_hash, message)
        logger.info(f"Message posted to {message.geohash}")

    def get_messages(self, lat: float, lon: float, precision: int = 7) -> List[Message]:
        """Reads messages for a location (from local cache)."""
        geohash = get_geohash(lat, lon, precision)
        info_hash = generate_info_hash(geohash, get_epoch_string())
        return self.storage.load_messages(info_hash)

    def stop(self):
        """Gracefully shuts down all components."""
        self.running = False
        self.sync.stop()
        self.swarm.stop_all()
        logger.info("StrataEngine stopped")

    def bridge_discovery(self):
        """
        Optional: Bridge BitTorrent peer discovery to Gossip.
        This helps find local peers even if UDP broadcast is limited.
        """
        for info_hash in self.active_info_hashes:
            handle = self.swarm.swarms.get(info_hash)
            if handle:
                for p in handle.get_peer_info():
                    # If it's a local or relevant peer, add to gossip
                    self.sync.add_peer(p.ip[0], port=self.sync.port)
