# Handshake Protocol: Space-Time P2P System Specification

**Version:** `v0.2.0-draft` (Work in Progress)

> [!NOTE]
> This document represents the official technical specification of the Handshake protocol. It defines message schemas, cryptographic identity, sovereign storage models, and wire protocols to ensure interoperability across heterogeneous clients (web frontends, native daemons, and mobile implementations). For core conceptual principles and non-negotiable architectural pillars, see [Architectural Invariants](architecture-invariants.md).

---

## 1. Cryptographic Identity

The protocol does not implement "user accounts", "registrations", or "profiles". Identity in Handshake is purely cryptographic, decentralized, and message-signature oriented:

*   **Ed25519 Keypairs:** Every node or author uses an Ed25519 asymmetric keypair:
    *   **Private Key (SK):** Local secret to digitally sign published messages. Stored strictly in client storage.
    *   **Public Key (PK):** Author identifier (`author_pk`) used by the P2P swarm to verify message integrity and authenticity, ensuring it was not tampered with during transport.
*   **Optional Pseudonymity:** Users can reuse keypairs for author consistency or generate ephemeral keys for isolated messages. The protocol does not link names, emails, or personal data to any key.

### Portable Identity Format (`.key`):
To enable sovereign import and export of keys between clients without server dependency:
```json
{
  "public_key": "hexadecimal_public_key_64_characters",
  "private_key": "hexadecimal_private_seed_64_characters"
}
```
*Standardized on a 32-byte private seed (64 hexadecimal characters).*

---

## 2. Message Schema

All messages on the network are public, open, and immutable. They are serialized and transmitted using strict JSON formatting. The schema consists of three primary blocks: `header` (cryptographic identity and thread graph), `anchor` (constitutive space-time anchor), and `content` (payload).

```json
{
  "version": "1.0",
  "header": {
    "author_pk": "hex_public_key_32_bytes",
    "parent_signature": "hex_parent_signature_64_bytes_optional",
    "signature": "hex_signature_64_bytes"
  },
  "anchor": {
    "timestamp": 1712345678,
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

### Fields and Technical Validation Rules:
*   `header.author_pk` (String, Required): 64-character hexadecimal representation of the author's 32-byte Ed25519 public key. Nodes MUST verify that it decodes to exactly 32 bytes and represents a valid Ed25519 curve point.
*   `header.parent_signature` (String | null, Optional): 128-character hexadecimal string representing the Ed25519 signature of the parent message being replied to (`null` if initiating a new root conversation). Nodes use this field to construct conversation trees without enforcing that author or location match the parent message.
*   `header.signature` (String, Required): 128-character hexadecimal Ed25519 signature computed over the canonical serialized JSON payload (RFC 8785) excluding this field itself.
*   `anchor.timestamp` (Integer, Required): 64-bit signed integer UNIX timestamp (seconds). **Validation Rule:** Nodes and trackers MUST NOT reject messages based on clock skew or future/past offsets (declarative time). Validity is governed solely by cryptographic signature integrity over the canonical payload.
*   `anchor.geohash` (String, Required): Canonical Geohash string (precision 6 or 7) derived from coordinates. Nodes MUST verify that `anchor.geohash` matches the geographic bounds of `anchor.coordinates`.
*   `anchor.coordinates` (Object, Required): High-precision geographical coordinates containing `lat` (Float between `-90.0` and `+90.0`) and `lon` (Float between `-180.0` and `+180.0`). In both root messages and conversation replies, coordinates are sovereign and declarative (replies are not required to share the parent's coordinates).
*   `anchor.proof` (Object, Optional): Cryptographic co-presence or spatial proof (`type`: `"GPS"`, `"WITNESS_SWARM"`, or `"NONE"`).
*   `content.text` (String, Required): UTF-8 message text content (plain text or lightweight markdown).
*   `content.attachments` (Array of Objects, Optional): List of linked multimedia attachments. Each item MUST contain `url` (String), `sha256` (64-character hex hash for cryptographic integrity verification), and `mime_type` (String).

### Canonical Serialization for Signature Verification (RFC 8785):
To generate or verify the Ed25519 signature:
1. Take the message JSON object **excluding the `header.signature` field**.
2. Recursively sort all object keys in lexicographical (Unicode code point) order following the JSON Canonicalization Scheme (RFC 8785).
3. Compactify the normalized JSON string without superfluous whitespace, encode as UTF-8, and sign/verify with the Ed25519 keypair.

### Security, Extensibility and Strict Schema Enforcement:
*   **Strict Closed Schema (Zero Smuggling):** To prevent payload smuggling, trojan data carriers, tracking tokens, and botnet command injection, nodes enforce strict closed-schema validation under `version: "1.0"`. Any message containing unrecognized fields at the root or within sub-objects is malformed and **must be immediately rejected and discarded**.
*   **Hard Message Size Limit:** The maximum allowable size for a serialized canonical message is **64 KB**. Messages exceeding this threshold are dropped at the transport boundary before signature parsing or cryptographic verification, preventing denial-of-service (DoS) and local storage bloat attacks.
*   **Signature Immutability:** Modifying, omitting, or reordering any field invalidates the original Ed25519 signature.
*   **Protocol Evolution:** Future extensions and additions require an explicit protocol version increment (e.g. `version: "1.1"` or `"2.0"`).

---

## 3. Tracker Signaling Wire Protocol (WebSocket)

The Space-Time Tracker serves exclusively as an ephemeral matchmaking and signaling coordinator. It maintains no centralized persistence of messages or user accounts; it connects peers exploring the same spatial swarm cell (Geohash precision 5, approx. 4.9 km × 4.9 km) to negotiate direct peer-to-peer transport.

**Endpoint:** `ws://<host>:<port>/ws/tracker/`

### Message Types:

#### 1. Peer Registration (`register`)
Sent by the client upon connecting or moving to a new spatial cell. Requires cryptographic authentication using the client's Ed25519 private key to prove key ownership and prevent peer impersonation, spoofing, and MITM signaling hijacking:
```json
{
  "type": "register",
  "peer_id": "7b8a1c...64_hex_author_pubkey",
  "geohash": "69y7pg3",
  "timestamp": 1712345678,
  "signature": "3f9c4a...128_hex_signature"
}
```

##### Authentication Challenge Payload:
To prove ownership of `peer_id`, the client signs the following deterministic ASCII string with its Ed25519 private key:
```
REGISTER:<peer_id>:<geohash>:<timestamp>
```
The tracker server verifies:
1. `peer_id` is a 32-byte Ed25519 public key in hexadecimal format (64 characters).
2. `timestamp` is within an acceptable skew window ($\pm 120$ seconds) of server time to prevent replay attacks.
3. `signature` is a valid detached Ed25519 signature of the challenge string for that `peer_id`.

If authentication succeeds, the tracker registers or updates the peer in its active peer registry. If authentication fails or fields are missing/expired, the tracker returns an error payload and discards the registration:
```json
{
  "type": "error",
  "code": "AUTH_FAILED",
  "message": "Invalid registration signature or expired timestamp"
}
```


#### 2. Nearby Peer List (`peer_list`)
Sent by the Tracker back to the registering client containing all active peers in the matching spatial swarm cell (Geohash precision 5):
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

#### 4. Peer Connection Signaling Relay (`signal`)
Relayed transparently as an opaque payload through the Tracker to negotiate direct P2P transport between peers (using standard WebRTC SDP offer/answer and ICE candidate schemas as the reference standard for browser swarms):
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

## 4. Direct Peer Synchronization Protocol (`strata-sync`)

Once a direct peer connection is established (e.g. over a WebRTC RTCDataChannel labeled `"strata-sync"` in browser swarms, or local transport in proximity encounters), data exchange is demand-driven and governed by inventory negotiation.

### DataChannel Message Exchange (3-Step Inventory Negotiation):

#### 1. Spatial Inventory Announcement (`inventory`)
Upon channel opening (`onopen`) or when a peer's viewport changes, the initiating client sends an inventory of known message signatures for its current spatial cell:
```json
{
  "type": "inventory",
  "geohash": "69y7p",
  "signatures": [
    "3f9c4a...signature1",
    "a1b2c3...signature2"
  ]
}
```

#### 2. Selective Missing Message Request (`request_missing`)
The receiving peer compares the inventory against its local storage and requests only signatures it does not possess:
```json
{
  "type": "request_missing",
  "signatures": [
    "3f9c4a...signature1"
  ]
}
```

#### 3. Payload Delivery (`sync_response`)
Sent in response to `request_missing` (delivering only requested messages), or broadcast across active peers when a new message is published locally:
```json
{
  "type": "sync_response",
  "graffitis": [
    {
      "version": "1.0",
      "header": {
        "author_pk": "7b8a1c...",
        "parent_signature": null,
        "signature": "3f9c4a..."
      },
      "anchor": {
        "timestamp": 1787928000,
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

#### 4. Ingestion & Zero-Trust Cryptographic Verification Pipeline:
When a peer receives a `sync_response`:
1. It iterates through each message in `graffitis`.
2. Reconstructs the canonical JSON payload (excluding `header.signature`) according to RFC 8785.
3. Verifies the Ed25519 signature against `header.author_pk`.
4. If valid, ingests the message into sovereign local storage and updates visual views. Untrusted or tampered messages are immediately discarded.

---

## 5. Swarm Grouping & InfoHash

Messages are grouped into **spatial cells and temporal epochs**:

1. **Spatial Resolution:** Territory is partitioned into spatial cells using **Geohash precision 6 or 7** (approx. ~1.2 km to ~150 meters).
2. **Temporal Resolution:** Time is partitioned into **monthly epochs** in `YYYY-MM` format.
3. **InfoHash Generation:** A deterministic SHA-1 identifier is computed for the swarm:
   $$\text{InfoHash} = \text{SHA1}(\text{geohash} + ":" + \text{epoch})$$
4. **Collective Seeding:** Peer connections exchange messages belonging to the given `InfoHash`, persisting them in local sovereign storage.
5. **Historical Custody:** Nodes can seed both current, past, and future epochs stored locally, acting as custodians of spatial-temporal memory.

---

## 6. Sovereign Storage, Metabolism, and Relational Schema

Clients maintain sovereign local-first storage. The protocol defines a reference relational schema (standardized with SQL / DuckDB semantics) to specify table structures, indexing requirements, and automatic metabolism purges across client implementations.

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
    qr_verified BOOLEAN DEFAULT TRUE    -- Verified via QR exchange or local pairing
);
```

### Reference Relational Queries (SQL / DuckDB):

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
*   **Storage Immunity & Custody:** Messages explicitly pinned by the user (`is_pinned = TRUE`) or authored by trusted contacts in `trusted_handshakes` are granted immunity against automatic storage metabolism purges.
*   **Optional In-Person Exchange:** Direct exchange of public keys (e.g. face-to-face QR code scanning or BLE proximity) can populate `trusted_handshakes` locally as an optional convenience.

---

## 7. Spatial Conversation Threads

*   **Parent Linking (`parent_signature`):** Replying to a message includes the parent message's Ed25519 signature in the header.
*   **Sovereign & Itinerant Replies:** Every reply is a sovereign space-time trace carrying its own declarative coordinates. An author may anchor a reply at the exact same location as the parent message, at their own physical location (tracing an itinerant physical path across the map), or at any arbitrary coordinates chosen across space.
*   **Decentralized Tree Reconstruction:** The client connects messages and reconstructs the thread tree locally using cryptographic signatures. If a node lacks a parent message, it can request it with priority from swarm peers.
