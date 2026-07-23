# Learning 04: Contacts & Trust Graphs (Web MVP)

In our current Web MVP, we rely on **Identity-aware communication**. This allows users to build "Trust Graphs" based on physical encounters, which directly influence how they perceive the digital world.

## 1. Identity Persistence
We use an `IdentityManager`. 
- **User Secret:** Your `Ed25519` private key is managed by your local environment (e.g., in the browser's secure storage or a local backend).
- **Consistency:** Your messages across different locations and times carry the same Public Key, allowing others to recognize you as the same entity.

## 2. The Contact Book
The `ContactBook` is a local database of public keys mapped to human-readable aliases.
- **Alias Resolution:** When the frontend reads a message, it checks the `ContactBook`. If the `author_pk` is recognized, it displays the alias (e.g., "Alice") and applies special visibility rules.
- **Local Sovereignty:** Your contacts are private to you. No central server knows who your friends are.

## 3. Trust Graphs & Visibility Multipliers
By recognizing identities, we build our core visibility mechanic:
- **Highlighted Traces:** Messages left by a trusted contact (someone in your `ContactBook`) are always highlighted and visible from much further distances in space and time.
- **Reputation (Handshake Accumulation):** Even for strangers, if a message accumulates many Handshakes (validations from other users), it becomes a high-signal trace that is visible from further away.

## 4. The Handshake Protocol (Intentional Trust)
A "Handshake" is the act of two peers cryptographically verifying their identities.
- **Mechanism:** In the Web MVP, this is typically an intentional act done in person. Users might scan a QR code displayed on each other's screens, exchanging their Public Keys.
- **Verification:** Once exchanged and verified, the UI prompts the user to add the peer to their `ContactBook` with a friendly alias. This "links" the cryptographic identity to a human name and activates the visibility multiplier for their messages.

---
*Code Reference:* See `src/strata/core/identity.py` for identity management.
