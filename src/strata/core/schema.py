"""
DuckDB Database Schemas and Schema Definitions for Strata / Handshake.

Defines the relational table structures for local-first embedded DuckDB stores
in accordance with protocol specifications.
"""

from typing import Any

GRAFFITIS_TABLE_SCHEMA = """CREATE TABLE IF NOT EXISTS graffitis (
    signature VARCHAR PRIMARY KEY,         -- Unique Ed25519 message signature
    author_pk VARCHAR NOT NULL,           -- Author public key
    parent_signature VARCHAR,             -- Parent message signature (for threads)
    timestamp BIGINT NOT NULL,            -- UNIX timestamp
    geohash VARCHAR NOT NULL,             -- Spatial geohash (e.g. 'dr5reg6')
    lat DOUBLE NOT NULL,                  -- Latitude
    lon DOUBLE NOT NULL,                  -- Longitude
    content_text TEXT NOT NULL,           -- Graffiti text content
    attachments_json JSON,                -- Serialized multimedia attachments
    is_pinned BOOLEAN DEFAULT FALSE,      -- Pinned flag for storage custody
    raw_json JSON NOT NULL                -- Canonical JSON payload for P2P re-seeding
);"""

TRUSTED_HANDSHAKES_TABLE_SCHEMA = """CREATE TABLE IF NOT EXISTS trusted_handshakes (
    public_key VARCHAR PRIMARY KEY,      -- Ed25519 public key of contact
    alias VARCHAR,                      -- Locally assigned alias/name
    added_at BIGINT NOT NULL,           -- UNIX timestamp when handshake was established
    qr_verified BOOLEAN DEFAULT TRUE    -- Verified via physical in-person QR exchange
);"""

INDEX_SCHEMAS = [
    "CREATE INDEX IF NOT EXISTS idx_spatial ON graffitis(geohash);",
    "CREATE INDEX IF NOT EXISTS idx_time ON graffitis(timestamp);",
    "CREATE INDEX IF NOT EXISTS idx_parent ON graffitis(parent_signature);",
]

TABLE_SCHEMAS: dict[str, dict[str, Any]] = {
    "graffitis": {
        "columns": {
            "signature": "VARCHAR",
            "author_pk": "VARCHAR",
            "parent_signature": "VARCHAR",
            "timestamp": "BIGINT",
            "geohash": "VARCHAR",
            "lat": "DOUBLE",
            "lon": "DOUBLE",
            "content_text": "TEXT",
            "attachments_json": "JSON",
            "is_pinned": "BOOLEAN",
            "raw_json": "JSON",
        },
        "primary_key": ["signature"],
        "ddl": GRAFFITIS_TABLE_SCHEMA,
    },
    "trusted_handshakes": {
        "columns": {
            "public_key": "VARCHAR",
            "alias": "VARCHAR",
            "added_at": "BIGINT",
            "qr_verified": "BOOLEAN",
        },
        "primary_key": ["public_key"],
        "ddl": TRUSTED_HANDSHAKES_TABLE_SCHEMA,
    },
}


def get_table_schemas() -> dict[str, dict[str, Any]]:
    """Returns dictionary of table schemas."""
    return TABLE_SCHEMAS
