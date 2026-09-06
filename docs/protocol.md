# Handshake Protocol: Space-Time P2P System Specification

**Version:** `v0.2.0-draft` (Work in Progress)

> [!NOTE]
> This document represents the official technical specification of the Handshake protocol. It defines message schemas, cryptographic identity, sovereign storage, and wire protocols to ensure interoperability across clients (TypeScript Web frontend, mobile apps, and Python engine).

---

## Rationale and Core Philosophy

### 1. The Vision
Most traditional networks are centered around abstract digital identity: profiles, accounts, followers, and digital reputation metrics. In an environment where distinguishing between humans, bots, or synthetic identities is irrelevant or impossible in the virtual realm, **Handshake shifts the center of gravity from users to messages**.

The network does not manage or validate virtual profiles. Instead, the system is a living landscape of **messages and digital graffitis anchored in exact space and time coordinates**.

Human validation does not occur through digital verification algorithms, but through **real physical encounters**. The protocol encourages physical presence and proximity, while in the virtual realm the fundamental unit of memory is always the space-time trace (the message), not the user account or profile.

### 2. Protocol Goals and Philosophy
*   **The Message as a Sovereign Unit:** There are no personal walls, inflated account follower counts, or algorithmic feeds. There are space-time graffitis. A message exists and retains value based on its location, content, and the collective interest in preserving it.
*   **Geography and Time as the Algorithm:** Visibility and discovery depend on geography and temporal moments. No attention optimization algorithms exist: to discover a digital trace, you must explore those coordinates.
*   **Sovereign Space-Time Placement (Past, Present & Future):** Both location and timestamp are declarative, expressive choices of the author. An author can leave a message anchored right now, in the past (historical documentation), or in the future (future rendezvous, time capsules, announcements).
*   **Custody and Collective Seeding (Data Sovereignty):** The network does not rely on a centralized proprietary server. Anyone can seed messages, freely deciding which spatial memory parts to preserve, replicate, or purge from local storage as historical custodians.
*   **Bridge to Physical Encounters:** Although the virtual network stores and exchanges messages regardless of abstract author identity, the protocol incentivizes real-world encounters as the genuine space for human trust validation.

---

## 1. Cryptographic Identity

The protocol does not implement "user accounts", "registrations", or "profiles". Identity in Handshake is purely cryptographic, decentralized, and message-signature oriented:

*   **Ed25519 Keypairs:** Every node or author uses an Ed25519 asymmetric keypair:
    *   **Private Key (SK):** Local secret to digitally sign published graffitis. Stored strictly in client storage.
    *   **Public Key (PK):** Author identifier (`author_pk`) used by the P2P swarm to verify message integrity and authenticity, ensuring it was not tampered with during transport.
*   **Optional Pseudonymity:** Users can reuse keypairs for author consistency or generate ephemeral keys for isolated messages. The protocol does not link names, emails, or personal data to any key.

### Portable Identity Format (`.key`):
To enable sovereign import and export of keys between clients (Web, CLI, mobile) without server dependency:
```json
{
  "public_key": "hexadecimal_public_key_64_characters",
  "private_key": "hexadecimal_private_key_64_or_128_characters"
}
```

---

## 2. Message Schema

All graffitis on the network are public, open, and immutable. They are serialized and transmitted using strict JSON formatting. The schema consists of three primary blocks: `header`, `location`, and `content`.

```json
{
  "version": "1.0",
  "header": {
    "author_pk": "hex_public_key_32_bytes",
    "parent_signature": "hex_parent_signature_64_bytes_optional",
    "timestamp": 1712345678,
    "signature": "hex_signature_64_bytes"
  },
  "location": {
    "geohash": "dr5reg6",
    "coordinates": {
      "lat": 40.712776,
      "lon": -74.005974
    },
    "proof": {
      "type": "GPS",
      "data": "40.712776,-74.005974"
    }
  },
  "content": {
    "text": "Space-time anchored graffiti content text",
    "attachments": [
      {
        "url": "https://example.com/audio.ogg",
        "sha256": "sha256_hex_hash_64_characters",
        "mime_type": "audio/ogg"
      }
    ]
  }
}
```

### Fields:
*   `header.author_pk`: Ed25519 public key (64 hex characters / 32 bytes) of the signing author.
*   `header.parent_signature` (Optional): Ed25519 signature of the parent graffiti being replied to (`null` if initiating a new root conversation). Enables spatial conversation trees and graphs.
*   `header.timestamp`: UNIX timestamp (seconds) when the graffiti is anchored in time.
*   `header.signature`: Ed25519 digital signature of the canonical serialized JSON object (excluding this signature field).
*   `location.geohash`: Standard Geohash (precision 6 or 7) used to index and discover spatial peer swarms in the area.
*   `location.coordinates`: High-precision geographical coordinates (`lat`, `lon`) for map rendering.
*   `location.proof` (Optional): Spatial or co-presence proof (`type`: `"GPS"`, `"WITNESS_SWARM"`, or `"NONE"`).
*   `content.text`: Message text content (required, plain text or lightweight markdown).
*   `content.attachments` (Optional): List of linked multimedia attachments. Each item contains `url`, `sha256` for cryptographic integrity verification, and `mime_type`.

### Canonical Serialization for Signature Verification:
To generate or verify the Ed25519 signature:
1. Take the message JSON object **excluding the `header.signature` field**.
2. Recursively sort all object keys alphabetically (`sort_keys=True` in Python / alphabetical object property sorting in TypeScript).
3. Compactify the normalized JSON string without superfluous whitespace, encode as UTF-8, and sign/verify with the Ed25519 keypair.

### Extensibility and Data Preservation:
*   **Unknown Fields:** If a client receives a message containing unknown schema fields from newer protocol versions, it must ignore them during local rendering but **must preserve them intact** in local storage JSON files and during P2P swarm retransmission.
*   **Signature Immutability:** Modifying, omitting, or reordering any field invalidates the original Ed25519 signature.

---

## 3. Sovereign Declarative Space-Time (Past, Present & Future)

A cornerstone of the Handshake protocol is that **both space and time are expressive, sovereign choices of the creator**:

1. **Declarative Coordinates:** Leaving a graffiti is intentional, akin to painting a specific physical wall. The author chooses where in the geographical landscape the trace is placed.
2. **Declarative Time (Writing to Future & Past):**
   - **Future Graffitis:** An author can anchor a message in a future timestamp (e.g., an invitation to a physical meet-up next Saturday, a time capsule, a prediction, or a scheduled announcement). The message will be discovered by peers exploring that future date on the temporal timeline.
   - **Historical Anchors:** An author can anchor a message in a past timestamp (e.g., chronicling a historical event that occurred at that location).
3. **No Artificial Rejection:** Swarm peers and trackers **do not reject** messages whose `timestamp` lies ahead of or behind the node's local system clock. Validity is determined solely by cryptographic Ed25519 signature integrity and canonical payload verification.

---

## 4. Tracker Signaling Wire Protocol (WebSocket)

The Django Space-Time Tracker serves exclusively as a decentralized matchmaking and signaling server. It does not store messages or track user accounts; it connects peers interested in the same spatial zones (`geohash[:5]`, approx. 4.9 km × 4.9 km).

**Endpoint:** `ws://<host>:<port>/ws/tracker/`

### Message Types:

#### 1. Peer Registration (`register`)
Sent by the client upon connecting or moving to a new spatial cell:
```json
{
  "type": "register",
  "peer_id": "ephemeral_client_uuid_or_pubkey_prefix",
  "geohash": "69y7pg3"
}
```

#### 2. Nearby Peer List (`peer_list`)
Sent by the Tracker back to the registering client containing all active peers in the matching zone (`geohash[:5]`):
```json
{
  "type": "peer_list",
  "peers": [
    { "peer_id": "peer_abc123", "geohash": "69y7pba" },
    { "peer_id": "peer_xyz789", "geohash": "69y7pff" }
  ]
}
```

#### 3. Swarm Presence Events (`peer_joined` / `peer_left`)
Broadcast by the Tracker to all active peers in the same spatial room when a peer enters or leaves:
```json
// Peer entered
{
  "type": "peer_joined",
  "peer_id": "peer_abc123",
  "geohash": "69y7pba"
}

// Peer departed
{
  "type": "peer_left",
  "peer_id": "peer_abc123"
}
```

#### 4. WebRTC Signaling Relay (`signal`)
Relayed transparently through the Tracker to negotiate direct P2P WebRTC data channels between peers:
```json
// SDP Offer / Answer
{
  "type": "signal",
  "target": "target_peer_id",
  "signal": {
    "sdp": {
      "type": "offer", // or "answer"
      "sdp": "v=0\r\no=- ..."
    }
  }
}

// ICE Candidate
{
  "type": "signal",
  "target": "target_peer_id",
  "signal": {
    "candidate": {
      "candidate": "candidate:1 1 UDP ...",
      "sdpMid": "0",
      "sdpMLineIndex": 0
    }
  }
}
```

---

## 5. WebRTC DataChannel Synchronization Protocol (`strata-sync`)

Once a direct WebRTC connection is established between two peers, communication occurs over an RTCDataChannel labeled `"strata-sync"`.

### DataChannel Message Exchange:

#### 1. Synchronization Request (`request_sync`)
Upon channel opening (`onopen`), the initiating client requests graffitis for its current spatial viewport:
```json
{
  "type": "request_sync",
  "geohash": "69y7p"
}
```

#### 2. Synchronization Response & Live Broadcast (`sync_response`)
Sent in response to `request_sync` or broadcast to all connected swarm peers whenever a new graffiti is authored or seeded locally:
```json
{
  "type": "sync_response",
  "graffitis": [
    {
      "version": "1.0",
      "header": {
        "author_pk": "7b8a1c...",
        "parent_signature": null,
        "timestamp": 1787928000,
        "signature": "3f9c4a..."
      },
      "location": {
        "geohash": "69y7pg3",
        "coordinates": { "lat": -34.6037, "lon": -58.3816 }
      },
      "content": {
        "text": "Meeting at the obelisk next Sunday at 18:00!"
      }
    }
  ]
}
```

#### 3. Ingestion & Cryptographic Verification Pipeline:
When a peer receives a `sync_response`:
1. It iterates through each graffiti in `graffitis`.
2. Reconstructs the canonical JSON payload (excluding `header.signature`).
3. Verifies the Ed25519 signature against `header.author_pk`.
4. If valid, persists the graffiti in local DuckDB/IndexedDB and updates the visual viewport.

---

## 6. Swarm Grouping & InfoHash

Graffitis are grouped into **spatial and temporal directories**:

1. **Spatial Resolution:** Territory is partitioned into spatial cells using **Geohash precision 6 or 7** (approx. ~1.2 km to ~150 meters).
2. **Temporal Resolution:** Time is partitioned into **monthly epochs** in `YYYY-MM` format.
3. **InfoHash Generation:** A deterministic SHA-1 identifier is computed for the swarm:
   $$\text{InfoHash} = \text{SHA1}(\text{geohash} + ":" + \text{epoch})$$
4. **Collective Seeding:** Peer connections exchange messages belonging to the given `InfoHash`. Each file is saved locally as:
   `{timestamp}_{author_pk_prefix}.msg`
5. **Historical Custody:** Nodes can seed both current, past, and future epochs stored locally, acting as custodians of spatial-temporal memory.

---

## 7. Sovereign Storage, Metabolism, and Embedded DuckDB

The protocol adopts **DuckDB** as the embedded database engine for Web clients (`@duckdb/duckdb-wasm` in IndexedDB) and desktop/server clients (`duckdb` in Python).

### Database Schemas

#### 1. Graffitis Table (`graffitis`)
```sql
CREATE TABLE IF NOT EXISTS graffitis (
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
);

CREATE INDEX IF NOT EXISTS idx_spatial ON graffitis(geohash);
CREATE INDEX IF NOT EXISTS idx_time ON graffitis(timestamp);
CREATE INDEX IF NOT EXISTS idx_parent ON graffitis(parent_signature);
```

#### 2. Trusted Handshakes Table (`trusted_handshakes`)
```sql
CREATE TABLE IF NOT EXISTS trusted_handshakes (
    public_key VARCHAR PRIMARY KEY,      -- Ed25519 public key of contact
    alias VARCHAR,                      -- Locally assigned alias/name
    added_at BIGINT NOT NULL,           -- UNIX timestamp when handshake was established
    qr_verified BOOLEAN DEFAULT TRUE    -- Verified via physical in-person QR exchange
);
```

### Core DuckDB Queries:

1. **Space-Time Retrieval for Map Viewport:**
   ```sql
   SELECT * FROM graffitis
   WHERE geohash LIKE 'dr5re%'
     AND timestamp BETWEEN :start_ts AND :end_ts
   ORDER BY timestamp DESC;
   ```

2. **Recursive Conversation Thread Reconstruction:**
   ```sql
   WITH RECURSIVE thread AS (
       SELECT * FROM graffitis WHERE signature = :target_signature
       UNION ALL
       SELECT g.* FROM graffitis g
       JOIN thread t ON g.parent_signature = t.signature
   )
   SELECT * FROM thread ORDER BY timestamp ASC;
   ```

3. **Storage Metabolism and Purge Policy (Configurable Limit):**
   ```sql
   -- Purge oldest messages that are neither pinned nor from trusted Handshake contacts
   DELETE FROM graffitis
   WHERE is_pinned = FALSE
     AND author_pk NOT IN (SELECT public_key FROM trusted_handshakes)
     AND signature IN (
         SELECT signature FROM graffitis
         WHERE is_pinned = FALSE
           AND author_pk NOT IN (SELECT public_key FROM trusted_handshakes)
         ORDER BY timestamp ASC
         LIMIT :purge_count
     );
   ```

### Handshake Role & Storage Immunity:
*   **In-Person Handshake:** Direct exchange of public keys (e.g. face-to-face QR code scanning) stored locally in `trusted_handshakes`.
*   **Prominence & Immunity:** Messages authored by public keys in `trusted_handshakes` or flagged as `is_pinned = TRUE` are granted immunity against automatic storage metabolism purges.

---

## 8. Spatial Conversation Threads

*   **Parent Linking (`parent_signature`):** Replying to a graffiti includes the parent message's Ed25519 signature in the header.
*   **Itinerant Conversations:** Each reply is anchored at the exact coordinates where the author is located when replying, tracing a physical and temporal trail across the map.
*   **Decentralized Tree Reconstruction:** The client connects messages and reconstructs the thread tree locally using cryptographic signatures. If a node lacks a parent message, it can request it with priority from swarm peers.
