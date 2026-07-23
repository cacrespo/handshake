# Learning 06: P2P Sync Protocol (WebRTC & Tracker)

To achieve a decentralized, BitTorrent-like seeding experience directly in the browser for our Web MVP, we replace traditional UDP/BitTorrent protocols with WebRTC and a Tracker.

## 1. The Space-Time Tracker (Django)
When a user explores a specific geographical area and time slice in the web app, they cannot simply broadcast UDP packets (browsers don't allow this). Instead, they contact the **Django Tracker**.
*   **DISCOVER:** "I am exploring coordinates X, Y at Time T. Is anyone else here?"
*   **MATCHING:** Django groups peers who are looking at the same space-time coordinates and sends them each other's connection details (SDP offers).

## 2. WebRTC Peer-to-Peer
Once Django introduces the peers, the server steps back. The browsers establish a direct **WebRTC** connection.
*   **DATA CHANNEL:** Peers use the WebRTC Data Channel to exchange their local inventories of "graffitis" for that specific area.
*   **SEEDING:** If Peer A has a graffiti that Peer B doesn't, Peer A seeds it directly to Peer B. 

## 3. The Three-Step Sync (Over WebRTC)
To minimize bandwidth, we use a "Pull-based" approach over the data channel:
1.  **INVENTORY:** Peer A sends a list of message hashes they have for the current coordinates.
2.  **REQUEST:** Peer B compares the hashes with their local storage (IndexedDB) and asks for the missing ones.
3.  **DATA:** Peer A sends the full message content.

## 4. Cryptographic Validation
Even though the data comes via WebRTC, we don't trust the transport layer. 
*   Every graffiti downloaded is a signed object.
*   The `StrataEngine` (running locally or via a local backend) verifies the Ed25519 signature of the graffiti against the author's Public Key before accepting it.

---
*Code Reference:* Future development will occur in the Django Tracker app and the Vite frontend (WebRTC signaling and data channel logic).
