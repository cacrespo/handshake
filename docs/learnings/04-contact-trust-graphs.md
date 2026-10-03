# Learning 04: Contacts & Trust Graphs (Web MVP)

> [!NOTE]
> **Architectural Evolution:** While physical in-person handshakes (QR scanning) were an early conceptual model for trust validation, the network architecture has prioritized sovereign space-time message circulation and collective seeding custody (Seed / Unseed). In-person pairing remains an optional convenience for personal contact books rather than a prerequisite for message discovery or network participation.

In our current Web MVP, we rely on **Identity-aware communication**. This allows users to build "Trust Graphs" based on cryptographic keys and contacts, which influence local custody and visibility.

## 1. Identity Persistence
We use an `IdentityManager`. 
- **User Secret:** Your `Ed25519` private key is managed by your local environment (e.g., in the browser's secure storage or a local backend).
- **Consistency:** Your messages across different locations and times carry the same Public Key, allowing others to recognize you as the same entity.

## 2. The Contact Book
The `ContactBook` is a local database of public keys mapped to human-readable aliases.
- **Alias Resolution:** When the frontend reads a message, it checks the `ContactBook`. If the `author_pk` is recognized, it displays the alias (e.g., "Alice") and applies special visibility rules.
- **Local Sovereignty:** Your contacts are private to you. No central server knows who your friends are.

## 3. Trust Graphs & Visibility Multipliers
By recognizing identities, we build local visibility and custody mechanics:
- **Highlighted Traces:** Messages left by a trusted contact (someone in your `ContactBook` added via cryptographic handshake) are highlighted and visible from further distances in space and time.
- **Collective Seeding (Swarm Availability):** When multiple nodes choose to seed a message locally (`Seed / Unseed`), its replication across the swarm increases, keeping it available and durable for anyone exploring those coordinates.

## 4. The Handshake Protocol (Intentional Trust)
A "Handshake" between users is the voluntary act of two peers cryptographically verifying their public keys:
- **Mechanism:** Users can scan a QR code displayed on each other's screens or exchange public keys via local BLE proximity.
- **Verification:** Once exchanged and verified, the client adds the public key to the local `ContactBook` (and `trusted_handshakes` table) with a friendly alias. This links the cryptographic identity to a human name, activates visual prominence for their messages, and grants them storage immunity against metabolism purges.

---
*Code Reference:* See `src/strata/core/identity.py` for identity management.
