import json
import os
import glob
from typing import List, Optional
from strata.core.models import Message

class StorageManager:
    def __init__(self, base_path: str = "./storage"):
        self.base_path = base_path
        os.makedirs(self.base_path, exist_ok=True)

    def get_swarm_path(self, info_hash: str) -> str:
        """Returns the path for a specific swarm."""
        path = os.path.join(self.base_path, info_hash)
        os.makedirs(path, exist_ok=True)
        return path

    def save_message(self, info_hash: str, message: Message):
        """Saves a message to the specified swarm directory."""
        swarm_path = self.get_swarm_path(info_hash)
        # Use a combination of timestamp and author for the filename
        filename = f"{int(message.timestamp)}_{message.author_pk.hex()[:8]}.msg"
        file_path = os.path.join(swarm_path, filename)
        
        data = message.to_dict()
        data["header"]["signature"] = message.signature.hex() if message.signature else None
        
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
        return file_path

    def load_messages(self, info_hash: str) -> List[Message]:
        """Loads and verifies all messages in a swarm directory."""
        swarm_path = self.get_swarm_path(info_hash)
        messages = []
        
        for file_path in glob.glob(os.path.join(swarm_path, "*.msg")):
            try:
                with open(file_path, "r") as f:
                    data = json.load(f)
                
                # Reconstruct message
                msg = Message(
                    author_pk=bytes.fromhex(data["header"]["author_pk"]),
                    geohash=data["location"]["geohash"],
                    content=data["content"]["text"],
                    message_type=data["header"]["type"],
                    owner_pk=bytes.fromhex(data["header"]["owner_pk"]) if data["header"]["owner_pk"] else None,
                    timestamp=data["header"]["timestamp"],
                    proof_type=data["location"]["proof"]["type"],
                    proof_data=data["location"]["proof"]["data"],
                    signature=bytes.fromhex(data["header"]["signature"]) if data["header"]["signature"] else None
                )
                
                if msg.verify():
                    messages.append(msg)
            except Exception as e:
                print(f"Error loading message {file_path}: {e}")
                
        # Sort by timestamp
        messages.sort(key=lambda x: x.timestamp)
        return messages
