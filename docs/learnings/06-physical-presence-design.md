# Learning 06: Space-Time Visibility & Handshake Mechanics (Milestone 3 - Web Pivot)

> [!NOTE]
> **Architectural Evolution:** Face-to-face encounters and in-person QR verification were initially explored as mandatory trust anchors, but the architecture has minimized physical encounter requirements. The system centers on sovereign message propagation, spatial swarms via WebRTC + Tracker, embedded DuckDB storage, and collective seeding custody (Seed / Unseed). In-person and BLE proximity mechanisms are preserved as optional local offline capabilities.

This design outlines our approach to visibility and presence in the Web MVP architecture, replacing hardware-only presence with an organic, coordinate-based visibility system.

## 1. Architectural Strategy (The Web Pivot)
We are moving away from BLE hardware presence and adopting a browser-first WebRTC + Tracker architecture.

- **Django Tracker:** Acts as the Space-Time signaling server. It connects peers who are exploring the exact same coordinates `(X, Y, Time)`.
- **WebRTC P2P:** Browsers download and seed "graffitis" directly from other users connected by the Tracker.
- **Strata Engine:** Continues to handle the cryptographic signatures and local data storage, now running alongside the web frontend.

## 2. The Visibility Mechanics (Friction & Reach)
In this system, anyone can explore messages left across the globe. Visibility and reach are governed by space-time coordinates, collective custody, and trusted contacts:

### The Rules of Visibility
1. **Local by Default (Coordinate Anchor):** A standard graffiti is anchored in its exact coordinates (`geohash`). To read it, you explore those spatial coordinates and temporal window.
2. **Collective Custody (Swarm Availability):** Graffitis that are actively seeded (`is_pinned = TRUE`) by more peers remain readily available, durable, and rapidly replicated across the local P2P swarm.
3. **The Trust Network:** If a graffiti was created by someone in your local `ContactBook` (trusted handshake), that graffiti receives visual priority and expanded visibility reach on your map.

## 3. The Roles of the "Handshake"
In the architecture, the term "Handshake" has two precise, distinct roles:
- **P2P Network Handshake:** When peers explore the same space-time zone, the Tracker coordinates a WebRTC handshake to open a direct `"strata-sync"` data channel between them, enabling decentralized seeding without centralized servers.
- **Trusted Identity Handshake:** Users can optionally perform an intentional key exchange (via QR code or BLE proximity) to establish verified mutual contacts and store them in `trusted_handshakes`.

---
*Code Reference:* Future development will occur in the Django Tracker logic and the Vite/React frontend for rendering the visibility radius on the map.
