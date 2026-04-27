import socket
import json
import threading
import time
import os
from typing import List, Set, Dict, Any
from strata.core.storage import StorageManager
from strata.core.models import Message

class SyncEngine:
    """
    Side-channel Gossip protocol for the Public Layer.
    Uses UDP broadcast to exchange message inventories and request missing data.
    """
    def __init__(self, storage: StorageManager, port: int = 6882):
        self.storage = storage
        self.port = port
        self.running = False
        
        # Setup UDP socket for broadcasting and receiving
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        self.sock.settimeout(1.0)

    def start(self):
        """Starts the gossip listener and broadcaster threads."""
        self.running = True
        self.listener_thread = threading.Thread(target=self._listen_loop, daemon=True)
        self.broadcaster_thread = threading.Thread(target=self._broadcast_loop, daemon=True)
        
        self.listener_thread.start()
        self.broadcaster_thread.start()

    def stop(self):
        self.running = False
        self.sock.close()

    def _listen_loop(self):
        """Main loop for receiving UDP packets."""
        MAX_PACKET_SIZE = 8192 # 8KB limit
        listen_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        listen_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            listen_sock.bind(('', self.port))
        except Exception as e:
            print(f"Failed to bind SyncEngine to port {self.port}: {e}")
            return
            
        listen_sock.settimeout(1.0)

        while self.running:
            try:
                data, addr = listen_sock.recvfrom(MAX_PACKET_SIZE)
                if len(data) > MAX_PACKET_SIZE:
                    continue # Ignore oversized packets
                
                payload = json.loads(data.decode('utf-8'))
                
                msg_type = payload.get("type")
                if msg_type == "INVENTORY":
                    self._handle_inventory(payload["geohash"], set(payload["hashes"]), addr)
                elif msg_type == "REQUEST":
                    self._handle_request(payload["info_hash"], payload["msg_hash"], addr)
                elif msg_type == "DATA":
                    self._handle_data(payload["info_hash"], payload["message"])
            except (socket.timeout, json.JSONDecodeError):
                continue
            except Exception as e:
                if self.running:
                    print(f"Sync Listener Error: {e}")

    def _broadcast_loop(self):
        """Periodically announces what we have to others."""
        while self.running:
            try:
                # Scan local storage to see what we can share
                for info_hash in os.listdir(self.storage.base_path):
                    messages = self.storage.load_messages(info_hash)
                    if not messages: continue
                    
                    geohash = messages[0].geohash
                    # We send short prefixes of signatures as identifiers
                    msg_hashes = [m.signature.hex()[:16] for m in messages if m.signature]
                    
                    packet = {
                        "type": "INVENTORY",
                        "geohash": geohash,
                        "info_hash": info_hash,
                        "hashes": msg_hashes
                    }
                    self.sock.sendto(json.dumps(packet).encode('utf-8'), ('<broadcast>', self.port))
            except Exception:
                pass
            
            time.sleep(5)

    def _handle_inventory(self, geohash: str, remote_hashes: Set[str], addr):
        """Compares remote hashes with local storage and requests missing ones."""
        # Find the info_hash for this geohash (simplified for Hito 1)
        # In a real scenario, we'd check all local swarms matching this geohash
        for info_hash in os.listdir(self.storage.base_path):
            local_messages = self.storage.load_messages(info_hash)
            if not local_messages or local_messages[0].geohash != geohash:
                continue
                
            local_hashes = set(m.signature.hex()[:16] for m in local_messages if m.signature)
            missing = remote_hashes - local_hashes
            
            for m_hash in missing:
                self._send_request(info_hash, m_hash, addr)

    def _send_request(self, info_hash: str, msg_hash: str, addr):
        """Sends a request for a specific message to a peer."""
        packet = {
            "type": "REQUEST",
            "info_hash": info_hash,
            "msg_hash": msg_hash
        }
        self.sock.sendto(json.dumps(packet).encode('utf-8'), addr)

    def _handle_request(self, info_hash: str, msg_hash: str, addr):
        """Sends the full message data if we have it."""
        messages = self.storage.load_messages(info_hash)
        for m in messages:
            if m.signature and m.signature.hex().startswith(msg_hash):
                self._send_data(info_hash, m, addr)
                break

    def _send_data(self, info_hash: str, message: Message, addr):
        """Sends the actual message JSON to a peer."""
        data = message.to_dict()
        data["header"]["signature"] = message.signature.hex() if message.signature else None
        
        packet = {
            "type": "DATA",
            "info_hash": info_hash,
            "message": data
        }
        self.sock.sendto(json.dumps(packet).encode('utf-8'), addr)

    def _handle_data(self, info_hash: str, msg_data: Dict[str, Any]):
        """Verifies and saves received message data."""
        try:
            # Reconstruct message
            msg = Message(
                author_pk=bytes.fromhex(msg_data["header"]["author_pk"]),
                geohash=msg_data["location"]["geohash"],
                content=msg_data["content"]["text"],
                message_type=msg_data["header"]["type"],
                owner_pk=bytes.fromhex(msg_data["header"]["owner_pk"]) if msg_data["header"]["owner_pk"] else None,
                timestamp=msg_data["header"]["timestamp"],
                proof_type=msg_data["location"]["proof"]["type"],
                proof_data=msg_data["location"]["proof"]["data"],
                signature=bytes.fromhex(msg_data["header"]["signature"]) if msg_data["header"]["signature"] else None
            )
            
            if msg.verify():
                self.storage.save_message(info_hash, msg)
                # print(f"✓ Synced new message from peer: {msg.content[:20]}...")
        except Exception:
            pass
