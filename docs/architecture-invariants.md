# Handshake Architectural Invariants

This document establishes the inviolable architectural and protocol invariants of the Handshake network. Any proposed feature, code modification, or documentation update must preserve these invariants without compromise.

Related specifications:
- [Protocol Specification](protocol.md)
- [Project Overview](../README.md)

---

## 1. Cryptographic Identity Invariant

Identity in Handshake is strictly cryptographic, local, and message-signature oriented:

- **Asymmetric Cryptographic Identity (Ed25519 standard):** The network operates without centralized user registration, user accounts, serverside password databases, or identity authorities. Clients generate and hold their own asymmetric Ed25519 keypairs derived from 32-byte seeds. Private keys never leave the author's local secure custody, and nodes authenticate messages exclusively via cryptographic signature verification.
- **Deterministic Canonical Serialization (Canonical JSON):** Every message is cryptographically signed and verified over a normalized, canonical JSON representation (RFC 8785: deterministic key ordering, compact encoding, UTF-8, excluding the `header.signature` field itself). Any alteration of characters, whitespace, field order, or values invalidates the signature.

---

## 2. Space-Time Anchoring Invariant

Space and time coordinates are the essential constitutive medium of Handshake messages:

- **Expressive, Voluntary, and Mandatory Anchor (Not Surveillance):** Geographic location is never passive tracking, telemetry, or surveillance imposed on the user. It is an intentional, expressive, voluntary, and necessary choice made by the author.
- **No Message Exists Without Space-Time Coordinates:** Every valid message must possess explicit space-time coordinates (latitude, longitude, their derived spatial geohash cell, and timestamp). A message detached from space and time is invalid under the protocol.
- **Declarative and Sovereign Coordinates for Roots and Replies:** Space-time coordinates are declarative choices of the author for both root messages and conversation replies. Authors of replies may anchor their response at the exact location of the parent message, at their current physical coordinates (tracing an itinerant physical path), or at any chosen map coordinates across the past, present, or future.

---

## 3. Decentralized Network Topology Invariant

The network topology strictly enforces peer-to-peer distribution:

- **Tracker as Matchmaking and Signaling Coordinator Only:** The Space-Time Tracker is a network support component whose sole responsibility is peer discovery, spatial matchmaking, and connection signaling to establish direct peer-to-peer (P2P) transport between nodes exploring matching spatial zones.
- **No Centralized Persistence of Messages or User Accounts:** The Tracker operates under a strict zero-persistence boundary: it never stores, indexes, or persists messages or user accounts. All state maintained by the Tracker is ephemeral and limited to active peer connection discovery.
- **Deterministic Swarm Partitioning:** Network swarms are partitioned deterministically by spatial cells (Geohash) and temporal epochs (`YYYY-MM`), with swarm discovery identifiers computed via deterministic hashing:
  $$\text{InfoHash} = \text{SHA1}(\text{geohash} + ":" + \text{epoch})$$

---

## 4. Sovereign Storage and Emergent Persistence Invariant

Message custody and query execution remain local-first and client-sovereign:

- **Local-First Sovereign Storage:** Clients maintain and query their own local message storage, operating completely independently of centralized servers for reads, writes, and thread reconstruction.
- **Emergent Network Persistence:** The network maintains no centralized persistence or global garbage collection. Message longevity across space and time is an emergent property: a message survives in the network solely as long as sovereign nodes voluntarily choose to keep and re-seed it.

---

## 5. P2P Synchronization Invariant

Data exchange between nodes is direct, peer-to-peer, and zero-trust:

- **Direct Peer-to-Peer Exchange:** Nodes synchronize messages directly with each other across decentralized swarms. Message dissemination relies on direct peer gossip without centralized relays or servers mediating data transit.
- **Inventory-First Negotiation:** Data transfer is strictly demand-driven and negotiated through inventories: nodes exchange message identifiers before transferring payloads, preventing redundant transmission and conserving device bandwidth.
- **Zero-Trust Transport Verification:** The network enforces zero trust on the transport layer and transmitting peers. No message is accepted into local storage based on its transit route; every received message must independently verify its cryptographic integrity and author signature before ingestion.
