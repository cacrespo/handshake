# Learning 06: P2P Sync Protocol (Gossip)

While BitTorrent is great for global data seeding, we need a faster, lighter way to sync messages with peers sitting right next to us. This is our **UDP Gossip Protocol**.

## 1. UDP Broadcast Discovery
When a Strata node starts, it doesn't know who is nearby. It uses **UDP Broadcast** (on port 6882) to announce its presence.
*   **DISCOVER:** "Is anyone there?"
*   **INVENTORY:** "I have these messages for this location."

## 2. The Three-Step Sync
To minimize bandwidth, we don't send the full message immediately. We use a "Pull-based" approach:
1.  **INVENTORY:** Peer A sends a list of message hashes they have.
2.  **REQUEST:** Peer B compares the hashes with their local storage and asks for the missing ones.
3.  **DATA:** Peer A sends the full message content for the requested hashes.

## 3. Cryptographic Handshake
How do we know a peer is who they say they are? Before exchanging contacts, we perform a **Handshake**.
*   **Signed Identity:** A handshake packet contains the user's Public Key and a Timestamp, signed with their Private Key.
*   **Replay Protection:** The timestamp ensures an attacker can't "record" a handshake and play it back later to impersonate someone.
*   **Verification:** The receiver uses the Public Key to verify the signature. If it's valid, they know the peer truly owns that identity.

## 4. Bridging Transports
Strata is unique because it bridges two worlds:
*   **Local (SyncEngine):** Uses UDP for sub-second synchronization with peers on the same Wi-Fi or local network.
*   **Global (SwarmManager):** Uses BitTorrent Mainline DHT to find peers across the entire internet.

The `StrataEngine` acts as a bridge, taking peers discovered via BitTorrent and introducing them to the faster Gossip protocol.

---
*Code Reference:* See `src/strata/core/sync.py` for the UDP state machine and `src/strata/core/engine.py` for the bridging logic.
