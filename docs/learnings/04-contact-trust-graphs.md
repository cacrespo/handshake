# Learning 04: Contacts & Trust Graphs

In Milestone 2, we moved from anonymous messages to **Identity-aware communication**. This allows users to build "Trust Graphs" based on physical or social encounters.

## 1. Identity Persistence
Unlike Milestone 1 (where we used dummy keys), we now use an `IdentityManager`. 
- **User Secret:** Your `Ed25519` private key is stored locally in `~/.strata/identity.json`.
- **Consistency:** Your messages across different locations and times now carry the same Public Key, allowing others to recognize you as the same entity.

## 2. The Contact Book
The `ContactBook` is a local database of public keys mapped to human-readable aliases.
- **Alias Resolution:** When the `StrataEngine` reads a message, it checks the `ContactBook`. If the `author_pk` is recognized, it displays the alias (e.g., "Alice") instead of a raw hex string.
- **Local Sovereignty:** Your contacts are private to you. No central server knows who your friends are.

## 3. Trust Graphs & Social Relays (Upcoming)
By recognizing identities, we can build advanced features:
- **Social Relays:** If a trusted contact (someone in your `ContactBook`) seeds a distant board, your node can prioritize syncing that data through them.
- **Reputation:** We can filter or highlight messages from known contacts, creating a high-signal environment without centralized moderation.

## 4. The Handshake Protocol (Work in Progress)
A "Handshake" is the act of two peers exchanging their Public Keys. 
- **Mechanism:** This can be done via QR codes, Bluetooth, or special P2P messages.
- **Verification:** Once Alice has Bob's Public Key and assigns him an alias, she can verify that any future message claiming to be from "Bob" is authentic.

---
*Code Reference:* See `src/strata/core/identity.py` for identity management and `src/strata/core/engine.py` for its integration into the core.
