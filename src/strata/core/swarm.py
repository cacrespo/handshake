import libtorrent as lt
import os


class SwarmManager:
    """
    Manages BitTorrent swarms for specific Geohashes/Epochs.
    Uses libtorrent to handle P2P synchronization.
    """

    def __init__(self, storage_path: str = "./storage", p2p_port: int = 6881):
        self.storage_path = storage_path
        os.makedirs(self.storage_path, exist_ok=True)

        # Initialize libtorrent session with a specific port
        self.session = lt.session(
            {"listen_interfaces": f"0.0.0.0:{p2p_port}", "enable_dht": True}
        )

        self.swarms = {}  # info_hash -> torrent_handle

    def start_swarm(self, info_hash_hex: str):
        """
        Starts or joins a swarm based on an InfoHash.
        In Hito 1, we use magnet links or DHT to find peers.
        """
        if info_hash_hex in self.swarms:
            return self.swarms[info_hash_hex]

        # Convert hex string to bytes
        info_hash_bytes = bytes.fromhex(info_hash_hex)

        # In libtorrent 2.0+, it's safer to use add_torrent_params
        params = lt.add_torrent_params()
        params.save_path = os.path.abspath(
            os.path.join(self.storage_path, info_hash_hex)
        )
        params.info_hash = lt.sha1_hash(info_hash_bytes)
        params.name = f"strata_{info_hash_hex[:8]}"

        handle = self.session.add_torrent(params)
        self.swarms[info_hash_hex] = handle

        # Force DHT lookup
        handle.force_reannounce()
        return handle

    def get_swarm_status(self, info_hash_hex: str):
        """Returns the current status of a swarm."""
        if info_hash_hex not in self.swarms:
            return None

        handle = self.swarms[info_hash_hex]
        return handle.status()

    def stop_all(self):
        """Shuts down all swarms and the session."""
        for info_hash, handle in self.swarms.items():
            self.session.remove_torrent(handle)
        self.swarms = {}
