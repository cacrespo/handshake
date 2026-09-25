import glob
import json
import logging
import os
import re
import time
from typing import Any

import duckdb
import pygeohash as pgh

from strata.core.models import Message
from strata.core.schema import (
    GRAFFITIS_TABLE_SCHEMA,
    INDEX_SCHEMAS,
    TRUSTED_HANDSHAKES_TABLE_SCHEMA,
)

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
        self, info_hash: str | None = None, exclude_path: str | None = None
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

    def load_messages(self, info_hash: str) -> list[Message]:
        """Loads and verifies all messages in a swarm directory."""
        swarm_path = self.get_swarm_path(info_hash)
        messages = []

        # Load both .msg and .msg.keep files
        for file_path in glob.glob(os.path.join(swarm_path, "*.msg*")):
            try:
                with open(file_path, "r") as f:
                    data = json.load(f)

                # Extract extra fields to preserve unrecognized metadata
                import copy
                extra = copy.deepcopy(data)
                extra.pop("version", None)
                if "header" in extra:
                    extra["header"].pop("type", None)
                    extra["header"].pop("owner_pk", None)
                    extra["header"].pop("author_pk", None)
                    extra["header"].pop("parent_signature", None)
                    extra["header"].pop("timestamp", None)
                    extra["header"].pop("signature", None)
                    if not extra["header"]:
                        extra.pop("header")
                if "location" in extra:
                    extra["location"].pop("geohash", None)
                    if "proof" in extra["location"]:
                        extra["location"]["proof"].pop("type", None)
                        extra["location"]["proof"].pop("data", None)
                        if not extra["location"]["proof"]:
                            extra["location"].pop("proof")
                    if not extra["location"]:
                        extra.pop("location")
                if "content" in extra:
                    extra["content"].pop("text", None)
                    if not extra["content"]:
                        extra.pop("content")

                # Reconstruct message
                msg = Message(
                    author_pk=bytes.fromhex(data["header"]["author_pk"]),
                    geohash=data["location"]["geohash"],
                    content=data["content"]["text"],
                    message_type=data["header"]["type"],
                    owner_pk=bytes.fromhex(data["header"]["owner_pk"])
                    if data["header"]["owner_pk"]
                    else None,
                    parent_signature=bytes.fromhex(data["header"]["parent_signature"])
                    if data["header"].get("parent_signature")
                    else None,
                    timestamp=data["header"]["timestamp"],
                    proof_type=data["location"]["proof"]["type"],
                    proof_data=data["location"]["proof"]["data"],
                    signature=bytes.fromhex(data["header"]["signature"])
                    if data["header"]["signature"]
                    else None,
                    extra=extra,
                )

                if msg.verify():
                    messages.append(msg)
            except Exception as e:
                logger.error(f"Error loading message {file_path}: {e}")

        # Sort by timestamp
        messages.sort(key=lambda x: x.timestamp)
        return messages


class StrataStorage:
    """
    Embedded DuckDB storage engine for local-first graffitis and trusted handshakes.
    Implements protocol specifications and relational schemas defined in strata.core.schema.
    """

    def __init__(self, db_path: str = ":memory:"):
        self.db_path = db_path
        if db_path != ":memory:":
            abs_path = os.path.abspath(os.path.expanduser(db_path))
            os.makedirs(os.path.dirname(abs_path), exist_ok=True)
            self.con = duckdb.connect(abs_path)
        else:
            self.con = duckdb.connect(":memory:")

        self._init_tables()

    def _init_tables(self):
        """Initializes tables and indexes from protocol specifications."""
        self.con.execute(GRAFFITIS_TABLE_SCHEMA)
        self.con.execute(TRUSTED_HANDSHAKES_TABLE_SCHEMA)
        for idx in INDEX_SCHEMAS:
            self.con.execute(idx)

    def _fetch_dicts(self, cursor) -> list[dict[str, Any]]:
        """Converts DB-API cursor results into list of dictionaries."""
        cols = [col[0] for col in cursor.description]
        rows = cursor.fetchall()
        return [dict(zip(cols, row)) for row in rows]

    def save_graffiti(
        self,
        message: Message,
        lat: float | None = None,
        lon: float | None = None,
        attachments: list[dict[str, Any]] | None = None,
        is_pinned: bool = False,
    ) -> str:
        """
        Persists or replaces a message in the graffitis table.
        Automatically derives latitude/longitude from geohash if not provided.
        """
        if lat is None or lon is None:
            decoded = pgh.decode(message.geohash)
            lat = float(decoded[0])
            lon = float(decoded[1])

        sig_hex = message.signature.hex() if message.signature else ""
        author_hex = message.author_pk.hex()
        parent_sig_hex = (
            message.parent_signature.hex() if message.parent_signature else None
        )
        ts = int(message.timestamp)

        att_list = (
            attachments
            if attachments is not None
            else message.extra.get("attachments", [])
        )
        att_json = json.dumps(att_list)

        msg_dict = message.to_dict()
        if sig_hex and "header" in msg_dict:
            msg_dict["header"]["signature"] = sig_hex
        raw_json = json.dumps(msg_dict, sort_keys=True)

        query = """
        INSERT OR REPLACE INTO graffitis (
            signature, author_pk, parent_signature, timestamp,
            geohash, lat, lon, content_text, attachments_json,
            is_pinned, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        self.con.execute(
            query,
            [
                sig_hex,
                author_hex,
                parent_sig_hex,
                ts,
                message.geohash,
                lat,
                lon,
                message.content,
                att_json,
                is_pinned,
                raw_json,
            ],
        )
        return sig_hex

    def get_graffiti(self, signature: str) -> dict[str, Any] | None:
        """Retrieves a single graffiti by its signature."""
        cur = self.con.execute(
            "SELECT * FROM graffitis WHERE signature = ?", [signature]
        )
        results = self._fetch_dicts(cur)
        return results[0] if results else None

    def get_graffitis(
        self,
        geohash_prefix: str | None = None,
        start_ts: int | None = None,
        end_ts: int | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        """Queries graffitis matching spatial and temporal constraints."""
        conditions = ["1=1"]
        params: list[Any] = []

        if geohash_prefix:
            conditions.append("geohash LIKE ?")
            params.append(f"{geohash_prefix}%")

        if start_ts is not None and end_ts is not None:
            conditions.append("timestamp BETWEEN ? AND ?")
            params.extend([start_ts, end_ts])
        elif start_ts is not None:
            conditions.append("timestamp >= ?")
            params.append(start_ts)
        elif end_ts is not None:
            conditions.append("timestamp <= ?")
            params.append(end_ts)

        sql = f"SELECT * FROM graffitis WHERE {' AND '.join(conditions)} ORDER BY timestamp DESC"
        if limit is not None:
            sql += f" LIMIT {int(limit)}"

        cur = self.con.execute(sql, params)
        return self._fetch_dicts(cur)

    def get_thread(self, target_signature: str) -> list[dict[str, Any]]:
        """Recursively reconstructs a conversation thread from a parent signature."""
        sql = """
        WITH RECURSIVE thread AS (
            SELECT * FROM graffitis WHERE signature = ?
            UNION ALL
            SELECT g.* FROM graffitis g
            JOIN thread t ON g.parent_signature = t.signature
        )
        SELECT * FROM thread ORDER BY timestamp ASC;
        """
        cur = self.con.execute(sql, [target_signature])
        return self._fetch_dicts(cur)

    def add_trusted_handshake(
        self,
        public_key: str,
        alias: str | None = None,
        added_at: int | None = None,
        qr_verified: bool = True,
    ):
        """Adds or updates a trusted contact handshake."""
        if added_at is None:
            added_at = int(time.time())
        query = """
        INSERT OR REPLACE INTO trusted_handshakes (
            public_key, alias, added_at, qr_verified
        ) VALUES (?, ?, ?, ?)
        """
        self.con.execute(query, [public_key, alias, added_at, qr_verified])

    def is_trusted(self, public_key: str) -> bool:
        """Checks if a public key belongs to a trusted handshake contact."""
        res = self.con.execute(
            "SELECT 1 FROM trusted_handshakes WHERE public_key = ?", [public_key]
        ).fetchone()
        return res is not None

    def metabolism_cleanup(self, limit: int = 100):
        """Purges oldest unpinned graffitis from untrusted authors."""
        query = """
        DELETE FROM graffitis
        WHERE is_pinned = FALSE
          AND author_pk NOT IN (SELECT public_key FROM trusted_handshakes)
          AND signature IN (
              SELECT signature FROM graffitis
              WHERE is_pinned = FALSE
                AND author_pk NOT IN (SELECT public_key FROM trusted_handshakes)
              ORDER BY timestamp ASC
              LIMIT ?
          )
        """
        self.con.execute(query, [limit])

    def count_graffitis(self) -> int:
        """Returns total graffiti count in the database."""
        res = self.con.execute("SELECT COUNT(*) FROM graffitis").fetchone()
        return res[0] if res else 0

    def close(self):
        """Closes the DuckDB connection."""
        self.con.close()
