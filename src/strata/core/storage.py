import json
import os
import glob
import re
import logging
from typing import List, Optional
from strata.core.models import Message

logger = logging.getLogger("strata.storage")


class StorageManager:
    def __init__(
        self,
        base_path: str = "./storage",
        max_messages_per_swarm: int = 100,
        max_total_size_mb: int = 500,
    ):
        self.base_path = os.path.abspath(base_path)
        self.max_messages_per_swarm = max_messages_per_swarm
        self.max_total_size_mb = max_total_size_mb
        os.makedirs(self.base_path, exist_ok=True)

    def get_swarm_path(self, info_hash: str) -> str:
        """
        Returns the path for a specific swarm.
        Ensures the info_hash is a valid hex string to prevent traversal.
        """
        if not re.match(r"^[a-fA-F0-9]+$", info_hash):
            raise ValueError("Invalid InfoHash format: must be hexadecimal.")

        path = os.path.join(self.base_path, info_hash)

        # Verify the path is still inside our base storage directory
        if not os.path.abspath(path).startswith(self.base_path):
            raise ValueError("Path traversal attempt detected.")

        os.makedirs(path, exist_ok=True)
        return path

    def mark_to_keep(self, file_path: str, keep: bool = True):
        """
        Marks a message to be kept (protected from metabolism) or removes the mark.
        Uses a '.keep' suffix.
        """
        if not os.path.exists(file_path) and not file_path.endswith(".keep"):
            # Try finding it with .keep if it's currently kept
            keep_path = file_path + ".keep"
            if os.path.exists(keep_path):
                file_path = keep_path

        if not os.path.exists(file_path):
            logger.error(f"File not found for marking: {file_path}")
            return None

        if keep and not file_path.endswith(".keep"):
            new_path = file_path + ".keep"
            os.rename(file_path, new_path)
            return new_path
        elif not keep and file_path.endswith(".keep"):
            new_path = file_path[: -len(".keep")]
            os.rename(file_path, new_path)
            return new_path

        return file_path

    def cleanup(
        self, info_hash: Optional[str] = None, exclude_path: Optional[str] = None
    ):
        """
        Performs metabolism cleanup.
        Priority: delete oldest non-protected (.keep) messages.
        """
        # 1. Swarm-level cleanup
        if info_hash:
            swarm_path = self.get_swarm_path(info_hash)
            # Only consider non-keep files for automatic deletion
            msg_files = [
                os.path.join(swarm_path, f)
                for f in os.listdir(swarm_path)
                if f.endswith(".msg")
            ]

            # NEVER delete the message we just saved if called from save_message
            if exclude_path:
                msg_files = [
                    f
                    for f in msg_files
                    if os.path.abspath(f) != os.path.abspath(exclude_path)
                ]

            logger.debug(
                f"Metabolism: Found {len(msg_files)} messages in swarm {info_hash}"
            )

            # Sort by filename (starts with timestamp) - oldest first
            msg_files.sort()

            if len(msg_files) >= self.max_messages_per_swarm:
                # If we have N or more messages and we are about to add one (or just added one)
                # we must keep only N-1 or N messages depending on when cleanup is called.
                # Since save_message calls it AFTER saving, we have N+1 messages total (if not excluded).
                # If excluded, we have N messages in msg_files and 1 in exclude_path.
                # To maintain max N total, we must only allow N-1 in msg_files.
                to_delete_count = len(msg_files) - (self.max_messages_per_swarm - 1)
                if to_delete_count > 0:
                    to_delete = msg_files[:to_delete_count]
                    logger.debug(
                        f"Metabolism: Deleting {len(to_delete)} oldest messages"
                    )
                    for f in to_delete:
                        try:
                            os.remove(f)
                            logger.debug(f"Metabolism: Deleted swarm message {f}")
                        except Exception as e:
                            logger.error(f"Metabolism: Failed to delete {f}: {e}")

        # 2. Global-level cleanup (Size based)
        total_size = sum(
            os.path.getsize(os.path.join(dirpath, filename))
            for dirpath, dirnames, filenames in os.walk(self.base_path)
            for filename in filenames
        )

        if total_size > (self.max_total_size_mb * 1024 * 1024):
            logger.info("Metabolism: Global storage limit reached. Cleaning up...")
            # Gather all non-keep messages across all swarms
            all_files = []
            for dirpath, dirnames, filenames in os.walk(self.base_path):
                for f in filenames:
                    if f.endswith(".msg"):
                        full_path = os.path.join(dirpath, f)
                        all_files.append((os.path.getmtime(full_path), full_path))

            # Sort by modification time (oldest first)
            all_files.sort()

            for _, f_path in all_files:
                if total_size <= (self.max_total_size_mb * 1024 * 1024):
                    break
                try:
                    f_size = os.path.getsize(f_path)
                    os.remove(f_path)
                    total_size -= f_size
                    logger.debug(f"Metabolism: Global delete {f_path}")
                except Exception:
                    pass

    def save_message(self, info_hash: str, message: Message):
        """Saves a message to the specified swarm directory."""
        swarm_path = self.get_swarm_path(info_hash)
        # Use a combination of timestamp and author for the filename
        filename = f"{int(message.timestamp)}_{message.author_pk.hex()[:8]}.msg"
        file_path = os.path.join(swarm_path, filename)

        data = message.to_dict()
        data["header"]["signature"] = (
            message.signature.hex() if message.signature else None
        )

        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)

        abs_path = os.path.abspath(file_path)

        # Trigger light cleanup, but EXCLUDE the file we just saved
        self.cleanup(info_hash, exclude_path=abs_path)

        return abs_path

    def load_messages(self, info_hash: str) -> List[Message]:
        """Loads and verifies all messages in a swarm directory."""
        swarm_path = self.get_swarm_path(info_hash)
        messages = []

        # Load both .msg and .msg.keep files
        for file_path in glob.glob(os.path.join(swarm_path, "*.msg*")):
            try:
                with open(file_path, "r") as f:
                    data = json.load(f)

                # Reconstruct message
                msg = Message(
                    author_pk=bytes.fromhex(data["header"]["author_pk"]),
                    geohash=data["location"]["geohash"],
                    content=data["content"]["text"],
                    message_type=data["header"]["type"],
                    owner_pk=bytes.fromhex(data["header"]["owner_pk"])
                    if data["header"]["owner_pk"]
                    else None,
                    timestamp=data["header"]["timestamp"],
                    proof_type=data["location"]["proof"]["type"],
                    proof_data=data["location"]["proof"]["data"],
                    signature=bytes.fromhex(data["header"]["signature"])
                    if data["header"]["signature"]
                    else None,
                )

                if msg.verify():
                    messages.append(msg)
            except Exception as e:
                logger.error(f"Error loading message {file_path}: {e}")

        # Sort by timestamp
        messages.sort(key=lambda x: x.timestamp)
        return messages
