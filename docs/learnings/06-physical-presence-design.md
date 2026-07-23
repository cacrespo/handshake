# Learning 06: Space-Time Visibility & Handshake Mechanics (Milestone 3 - Web Pivot)

This design outlines our approach to visibility and presence in the new Web MVP architecture, replacing the old Bluetooth (BLE) approach with an organic, coordinate-based visibility system.

## 1. Architectural Strategy (The Web Pivot)
We are moving away from BLE hardware presence and adopting a browser-first WebRTC + Tracker architecture.

- **Django Tracker:** Acts as the Space-Time signaling server. It connects peers who are exploring the exact same coordinates `(X, Y, Time)`.
- **WebRTC P2P:** Browsers download and seed "graffitis" directly from other users connected by the Tracker.
- **Strata Engine:** Continues to handle the cryptographic signatures and local data storage, now running alongside the web frontend.

## 2. The Visibility Mechanics (Friction & Reach)
In this system, anyone can see messages left in a location, but the **distance** from which a message is visible (how far away you can be in space and time to still see it) is governed by **Handshakes**.

### The Rules of Visibility
1. **Local by Default (High Friction):** A standard graffiti has a very small visibility radius. You must virtually navigate (or physically walk) to its exact coordinates to read it.
2. **The Handshake Multiplier (Social Beacon):** When a message receives many "Handshakes" (validations/upvotes from users who physically or virtually encountered it), its signal strengthens. It becomes a beacon visible from much further distances in both space (e.g., visible from across the city) and time (e.g., remains visible months later).
3. **The Trust Network:** If a graffiti was created by someone you have personally Handshaked with (a trusted contact), that graffiti bypasses standard friction for you. It will be highlighted and visible from much further away, ensuring your trust network's traces are always accessible.

## 3. The New "Handshake"
Without BLE, a Handshake is no longer an automatic background hardware ping. It is an intentional act of trust:
- **In-Person Validation:** Two users meet physically and scan a QR code in the Web App to cryptographically link their identities.
- **Content Validation:** Users can "Handshake" a specific graffiti, increasing its global visibility multiplier.

---
*Code Reference:* Future development will occur in the Django Tracker logic and the Vite/React frontend for rendering the visibility radius on the map.
