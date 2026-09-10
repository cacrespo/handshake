# Handshake Architectural Invariants

This document establishes the inviolable architectural and protocol invariants of the Handshake network. Any proposed feature, code modification, or documentation update must preserve these invariants without compromise.

Related specifications:
- [Protocol Specification](protocol.md)
- [Project Overview](../README.md)

---

## 1. Cryptographic Identity Invariant

Identity in Handshake is strictly cryptographic, local, and message-signature oriented:

- **Ed25519 Keypairs and 32-Byte Seeds:** Every client generates and controls its own asymmetric Ed25519 keypair derived from 32-byte seeds. Private keys never leave the author's local secure custody.
- **Canonical JSON Signature Verification:** Every message is cryptographically signed over a normalized, canonical JSON representation (`sort_keys=True`, compact separators, UTF-8 encoding, excluding the `header.signature` field itself). Any alteration of whitespace, field order, or values invalidates the signature.
- **Absence of Centralized User Accounts:** The network operates without centralized user registration, user accounts, serverside password databases, or identity authorities. Nodes recognize messages based exclusively on Ed25519 cryptographic authenticity.

---

## 2. Space-Time Anchoring Invariant

Space and time coordinates are the essential constitutive medium of Handshake messages:

- **Expressive, Voluntary, and Mandatory Anchor (Not Surveillance):** Geographic location is never passive tracking, telemetry, or surveillance imposed on the user. It is an intentional, expressive, voluntary, and necessary choice made by the author.
- **No Message Exists Without Space-Time Coordinates:** Every valid message must possess explicit space-time coordinates (`geohash`, `coordinates.lat`, `coordinates.lon`, and `timestamp`). A message detached from space and time is invalid under the protocol.
- **Declarative and Sovereign Coordinates for Roots and Replies:** Space-time coordinates are declarative choices of the author for both root messages and conversation replies. Authors of replies may anchor their response at the exact location of the parent graffiti, at their current physical coordinates (tracing an itinerant physical path), or at any chosen map coordinates across the past, present, or future.

---

## 3. Decentralized Network Topology Invariant

The network topology strictly enforces peer-to-peer distribution:

- **Tracker as Matchmaking and Signaling Coordinator Only:** The Django Space-Time Tracker serves strictly as a matchmaking and WebRTC signaling coordinator between peers interested in matching spatial zones (`geohash[:5]`).
- **No Centralized Persistence of Messages or User Accounts:** The Tracker never persists messages, graffitis, or user accounts. All state maintained by the Tracker is ephemeral and limited to active peer connection discovery.
- **Deterministic Swarm Partitioning:** Network swarms are partitioned deterministically by spatial cells (Geohash precision 6 or 7) and temporal epochs (`YYYY-MM`), with swarm discovery identifiers computed via deterministic hashing:
  $$\text{InfoHash} = \text{SHA1}(\text{geohash} + ":" + \text{epoch})$$

---

## 4. Sovereign Storage and Storage Metabolism Invariant

Message custody and query execution remain local-first and client-sovereign:

- **Local-First Embedded DuckDB:** Clients maintain their primary query and storage engine using embedded DuckDB:
  - Web clients execute `@duckdb/duckdb-wasm` over browser IndexedDB.
  - Python CLI and background engine daemons execute embedded `duckdb`.
- **Storage Metabolism:** Local storage is governed by automated digital metabolism (LRU cleanup) to prevent uncontrolled disk growth on client devices.
- **Handshake Storage Immunity:** Messages authored by verified in-person contacts (stored in `trusted_handshakes`) or explicitly pinned by the user (`is_pinned = TRUE` / `.keep`) are immune to automatic metabolism purges.
- **Documented Relational Schemas:** Local DuckDB stores adhere to canonical tables: `graffitis` (with fields: `signature`, `author_pk`, `parent_signature`, `timestamp`, `geohash`, `lat`, `lon`, `content_text`, `attachments_json`, `is_pinned`, `raw_json`) and `trusted_handshakes` (with fields: `public_key`, `alias`, `added_at`, `qr_verified`).

---

## 5. P2P Synchronization Invariant

Data exchange between nodes is direct, peer-to-peer, and zero-trust:

- **Gossip `strata-sync` Wire Protocol:** Peers synchronize graffitis directly over WebRTC DataChannels labeled `"strata-sync"` in browser swarms, and over Bluetooth Low Energy (BLE) or local transport during physical proximity encounters.
- **Pull-Based Inventory Negotiation:** Synchronization follows an inventory-first negotiation (`request_sync` and `sync_response`) to minimize redundant data transfer across channels.
- **Zero-Trust Transport Verification:** Nodes never trust the transport mechanism. Every received graffiti must pass full canonical JSON reconstruction and Ed25519 signature verification against `header.author_pk` before ingestion into local storage.
