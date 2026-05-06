import socket
import json
import threading
import time
import os
import logging
from typing import Set, Dict, Any, Optional, List
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
        try:
            temp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            temp_sock.sendto(b"{}", ("127.0.0.1", self.port))
            temp_sock.close()
        except Exception:
            pass
        self.sock.close()

    def add_peer(self, ip: str, port: int):
        """
        Manually triggers an inventory exchange with a specific peer.
        """
        logger.info(f"Proactively initiating sync with peer {ip}:{port}")

        swarms = []
        if os.path.exists(self.storage.base_path):
            swarms = [d for d in os.listdir(self.storage.base_path) if os.path.isdir(os.path.join(self.storage.base_path, d))]

        if not swarms:
            packet = {
                "type": "DISCOVER",
                "port": self.port
            }
            self.sock.sendto(json.dumps(packet).encode("utf-8"), (ip, port))
            return

        for info_hash in swarms:
            messages = self.storage.load_messages(info_hash)
            geohash = messages[0].geohash if messages else "unknown"
            msg_hashes = [m.signature.hex()[:16] for m in messages if m.signature]

            packet = {
                "type": "INVENTORY",
                "geohash": geohash,
                "info_hash": info_hash,
                "hashes": msg_hashes,
                "port": self.port
            }
            try:
                self.sock.sendto(json.dumps(packet).encode("utf-8"), (ip, port))
            except Exception as e:
                logger.error(f"Failed to send proactive inventory to {ip}: {e}")

    def _listen_loop(self):
        MAX_PACKET_SIZE = 65535
        try:
            self.sock.bind(("", self.port))
        except Exception as e:
            logger.error(f"Bind error on port {self.port}: {e}")
            return

        while self.running:
            try:
                data, addr = self.sock.recvfrom(MAX_PACKET_SIZE)
                if not data:
                    continue
                payload = json.loads(data.decode("utf-8"))

                msg_type = payload.get("type")
                remote_port = payload.get("port", addr[1])
                remote_addr = (addr[0], remote_port)

                if msg_type == "DISCOVER":
                    self._handle_discover(remote_addr)
                elif msg_type == "INVENTORY":
                    self._handle_inventory(
                        payload["geohash"], payload["info_hash"], set(payload["hashes"]), remote_addr
                    )
                elif msg_type == "REQUEST":
                    self._handle_request(
                        payload["info_hash"], payload["msg_hash"], remote_addr
                    )
                elif msg_type == "DATA":
                    self._handle_data(payload["info_hash"], payload["message"])
            except (socket.timeout, json.JSONDecodeError):
                continue
            except Exception as e:
                if self.running:
                    logger.error(f"Listen error: {e}")

    def _handle_discover(self, addr):
        logger.info(f"Received discovery from {addr}")
        if not os.path.exists(self.storage.base_path):
            return

        for info_hash in os.listdir(self.storage.base_path):
            full_path = os.path.join(self.storage.base_path, info_hash)
            if not os.path.isdir(full_path):
                continue
            messages = self.storage.load_messages(info_hash)
            if not messages: continue
            
            local_hashes = [m.signature.hex()[:16] for m in messages if m.signature]
            self._send_inventory(messages[0].geohash, info_hash, local_hashes, addr)

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
                        "port": self.port
                    }

                    data = json.dumps(packet).encode("utf-8")
                    try:
                        self.sock.sendto(data, ("<broadcast>", self.port))
                        self.sock.sendto(data, ("127.0.0.1", self.port))
                    except Exception as e:
                        logger.debug(f"Broadcast send error: {e}")
            except Exception as e:
                logger.error(f"Broadcast error: {e}")

            time.sleep(2)

    def _handle_inventory(self, geohash: str, info_hash: str, remote_hashes: Set[str], addr):
        logger.info(f"Received inventory for {info_hash} from {addr} ({len(remote_hashes)} hashes)")
        
        local_messages = self.storage.load_messages(info_hash)
        local_hashes = set(m.signature.hex()[:16] for m in local_messages if m.signature)
        
        missing = remote_hashes - local_hashes
        if missing:
            logger.info(f"Requesting {len(missing)} missing messages for {info_hash}")
            for m_hash in missing:
                self._send_request(info_hash, m_hash, addr)
        
        if local_hashes - remote_hashes:
            logger.info(f"Sending back inventory for {info_hash} to {addr}")
            self._send_inventory(geohash, info_hash, list(local_hashes), addr)

    def _send_inventory(self, geohash: str, info_hash: str, hashes: List[str], addr):
        packet = {
            "type": "INVENTORY",
            "geohash": geohash,
            "info_hash": info_hash,
            "hashes": hashes,
            "port": self.port
        }
        self.sock.sendto(json.dumps(packet).encode("utf-8"), addr)

    def _send_request(self, info_hash: str, msg_hash: str, addr):
        logger.info(f"Sending REQUEST for {msg_hash} to {addr}")
        packet = {"type": "REQUEST", "info_hash": info_hash, "msg_hash": msg_hash, "port": self.port}
        self.sock.sendto(json.dumps(packet).encode("utf-8"), addr)

    def _handle_request(self, info_hash: str, msg_hash: str, addr):
        logger.info(f"Received REQUEST for {msg_hash} from {addr}")
        messages = self.storage.load_messages(info_hash)
        for m in messages:
            if m.signature and m.signature.hex().startswith(msg_hash):
                logger.info(f"Found message for {msg_hash}, sending DATA to {addr}")
                self._send_data(info_hash, m, addr)
                return
        logger.warning(f"Message {msg_hash} NOT found in swarm {info_hash}")

    def _send_data(self, info_hash: str, message: Message, addr):
        data = message.to_dict()
        data["header"]["signature"] = (
            message.signature.hex() if message.signature else None
        )
        packet = {"type": "DATA", "info_hash": info_hash, "message": data, "port": self.port}
        logger.info(f"Sending DATA packet for {message.content[:20]} to {addr}")
        self.sock.sendto(json.dumps(packet).encode("utf-8"), addr)

    def _handle_data(self, info_hash: str, msg_data: Dict[str, Any]):
        logger.info(f"Received DATA for {info_hash}")
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
                logger.info(f"Synced message from {msg.author_pk.hex()[:8]}: {msg.content[:20]}...")
        except Exception as e:
            logger.error(f"Sync error: {e}")
