import socket
import json
import threading
import time
import os
import logging
from typing import Set, Dict, Any, Optional
from strata.core.storage import StorageManager
from strata.core.models import Message

logger = logging.getLogger("strata.sync")


class SyncEngine:
    def __init__(self, storage: StorageManager, port: int = 6882):
        self.storage = storage
        self.port = port
        self.running = False

        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        self.sock.settimeout(0.5)

    def start(self):
        self.running = True
        self.listener_thread = threading.Thread(target=self._listen_loop, daemon=True)
        self.broadcaster_thread = threading.Thread(
            target=self._broadcast_loop, daemon=True
        )
        self.listener_thread.start()
        self.broadcaster_thread.start()
        logger.info(f"SyncEngine started on port {self.port}")

    def stop(self):
        self.running = False
        # Send a dummy packet to itself to break the recvfrom block if needed
        try:
            temp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            temp_sock.sendto(b"{}", ("127.0.0.1", self.port))
            temp_sock.close()
        except Exception:
            pass
        self.sock.close()

    def add_peer(self, ip: str, port: Optional[int] = None):
        """
        Manually triggers an inventory exchange with a specific peer.
        This is useful for bridging with other discovery mechanisms like BitTorrent.
        """
        target_port = port or self.port
        logger.info(f"Proactively initiating sync with peer {ip}:{target_port}")

        for info_hash in os.listdir(self.storage.base_path):
            full_path = os.path.join(self.storage.base_path, info_hash)
            if not os.path.isdir(full_path):
                continue

            messages = self.storage.load_messages(info_hash)
            if not messages:
                continue

            geohash = messages[0].geohash
            msg_hashes = [m.signature.hex()[:16] for m in messages if m.signature]

            packet = {
                "type": "INVENTORY",
                "geohash": geohash,
                "info_hash": info_hash,
                "hashes": msg_hashes,
            }
            try:
                self.sock.sendto(json.dumps(packet).encode("utf-8"), (ip, target_port))
            except Exception as e:
                logger.error(f"Failed to send proactive inventory to {ip}: {e}")

    def _listen_loop(self):
        MAX_PACKET_SIZE = 65535
        listen_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        listen_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            listen_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        try:
            listen_sock.bind(("", self.port))
        except Exception as e:
            logger.error(f"Bind error: {e}")
            return

        listen_sock.settimeout(1.0)
        while self.running:
            try:
                data, addr = listen_sock.recvfrom(MAX_PACKET_SIZE)
                if not data:
                    continue
                payload = json.loads(data.decode("utf-8"))

                msg_type = payload.get("type")
                if msg_type == "INVENTORY":
                    self._handle_inventory(
                        payload["geohash"], set(payload["hashes"]), addr
                    )
                elif msg_type == "REQUEST":
                    self._handle_request(
                        payload["info_hash"], payload["msg_hash"], addr
                    )
                elif msg_type == "DATA":
                    self._handle_data(payload["info_hash"], payload["message"])
            except (socket.timeout, json.JSONDecodeError):
                continue
            except Exception as e:
                if self.running:
                    logger.error(f"Listen error: {e}")

    def _broadcast_loop(self):
        while self.running:
            try:
                if not os.path.exists(self.storage.base_path):
                    time.sleep(1)
                    continue

                for info_hash in os.listdir(self.storage.base_path):
                    full_path = os.path.join(self.storage.base_path, info_hash)
                    if not os.path.isdir(full_path):
                        continue

                    messages = self.storage.load_messages(info_hash)
                    if not messages:
                        continue

                    geohash = messages[0].geohash
                    msg_hashes = [
                        m.signature.hex()[:16] for m in messages if m.signature
                    ]

                    packet = {
                        "type": "INVENTORY",
                        "geohash": geohash,
                        "info_hash": info_hash,
                        "hashes": msg_hashes,
                    }

                    # Target both broadcast and local loopback
                    data = json.dumps(packet).encode("utf-8")
                    self.sock.sendto(data, ("<broadcast>", self.port))
                    self.sock.sendto(data, ("127.0.0.1", self.port))
            except Exception as e:
                logger.error(f"Broadcast error: {e}")

            time.sleep(2)  # Faster broadcast for tests/responsiveness

    def _handle_inventory(self, geohash: str, remote_hashes: Set[str], addr):
        for info_hash in os.listdir(self.storage.base_path):
            full_path = os.path.join(self.storage.base_path, info_hash)
            if not os.path.isdir(full_path):
                continue

            local_messages = self.storage.load_messages(info_hash)
            if not local_messages or local_messages[0].geohash != geohash:
                continue

            local_hashes = set(
                m.signature.hex()[:16] for m in local_messages if m.signature
            )
            missing = remote_hashes - local_hashes

            for m_hash in missing:
                logger.info(f"Requesting missing {m_hash} from {addr}")
                self._send_request(info_hash, m_hash, addr)

    def _send_request(self, info_hash: str, msg_hash: str, addr):
        packet = {"type": "REQUEST", "info_hash": info_hash, "msg_hash": msg_hash}
        # Send back to whoever sent the inventory, but on the sync port
        self.sock.sendto(json.dumps(packet).encode("utf-8"), (addr[0], self.port))

    def _handle_request(self, info_hash: str, msg_hash: str, addr):
        messages = self.storage.load_messages(info_hash)
        for m in messages:
            if m.signature and m.signature.hex().startswith(msg_hash):
                logger.info(f"Sending data for {msg_hash} to {addr}")
                self._send_data(info_hash, m, addr)
                break

    def _send_data(self, info_hash: str, message: Message, addr):
        data = message.to_dict()
        data["header"]["signature"] = (
            message.signature.hex() if message.signature else None
        )
        packet = {"type": "DATA", "info_hash": info_hash, "message": data}
        self.sock.sendto(json.dumps(packet).encode("utf-8"), (addr[0], self.port))

    def _handle_data(self, info_hash: str, msg_data: Dict[str, Any]):
        try:
            msg = Message(
                author_pk=bytes.fromhex(msg_data["header"]["author_pk"]),
                geohash=msg_data["location"]["geohash"],
                content=msg_data["content"]["text"],
                message_type=msg_data["header"]["type"],
                owner_pk=bytes.fromhex(msg_data["header"]["owner_pk"])
                if msg_data["header"]["owner_pk"]
                else None,
                timestamp=msg_data["header"]["timestamp"],
                proof_type=msg_data["location"]["proof"]["type"],
                proof_data=msg_data["location"]["proof"]["data"],
                signature=bytes.fromhex(msg_data["header"]["signature"])
                if msg_data["header"]["signature"]
                else None,
            )
            if msg.verify():
                self.storage.save_message(info_hash, msg)
                logger.info(f"Synced: {msg.content[:20]}...")
        except Exception as e:
            logger.error(f"Sync error: {e}")
