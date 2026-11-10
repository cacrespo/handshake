# Handshake Web Client

The **Handshake Web Client** is a browser-based, local-first client for the Handshake space-time network. It provides an interactive 2D map (Leaflet) and 3D globe (Three.js) to navigate, publish, and collectively seed digital graffitis anchored in exact space and time coordinates.

All invariants defined in [Architectural Invariants](../docs/architecture-invariants.md) and specifications in [Protocol Specification](../docs/protocol.md) are strictly implemented.

---

## Key Architectural Capabilities

- **Sovereign Local-First Storage:** Persists messages and trusted contacts locally in browser **IndexedDB** (`src/storage/db.ts`). Queries, thread assembly, and storage metabolism run entirely in the client without centralized database dependencies.
- **Direct P2P Swarm Synchronization:** Negotiates direct peer-to-peer data exchange over **WebRTC DataChannels** (`src/sync.ts`) using the 3-step inventory negotiation protocol (`inventory`, `request_missing`, `sync_response`).
- **Space-Time Matchmaking:** Connects to the ephemeral Django Space-Time Tracker over WebSockets (`ws://`) to discover active peers exploring the same spatial cell (`geohash[:5]`).
- **Cryptographic Identity:** Generates and holds sovereign Ed25519 asymmetric keypairs derived from 32-byte seeds (via TweetNaCl). Every message is signed over its canonical JSON representation (RFC 8785) with strict 64 KB message size enforcement.
- **Space-Time Triad UI (50 / 25 / 25 Ratio):** Balanced sovereign layout organizing interface cognitive weight:
  - **50% — Sovereign Message Stream & Threads (The Hero):** Central, high-readability stream for browsing, reading, and composing graffitis, with first-class support for conversational trees, parent-reply links, rich text, and cryptographic verification badges.
  - **25% — Spatial Context & Radar (Where):** Dedicated spatial viewport and radar panel (interactive 3D globe or 2D map) showing active cluster pulses and user presence beacon with bidirectional coordinates synchronization.
  - **25% — Temporal Horizon & Interactive Timeline (When):** Continuous timeline scrubber and epoch dial across Past (historical documentation & custodian archives), Present (live P2P swarm updates via strata-sync), and Future (time capsules & scheduled rendezvous).
- **Responsive Cockpit & Mobile Navigation:** Unified 3-column cockpit on widescreen and responsive tabbed navigation on mobile with persistent message primacy.

---

## Getting Started

### Prerequisites
- Node.js 20+
- npm

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```
Starts the Vite dev server at `http://localhost:5173`. Ensure the Tracker server is running at `localhost:8000` for peer matchmaking.

### Automated Testing & Quality Checks
```bash
# Run unit and integration tests (Vitest)
npm test

# Production build and type checking
npm run build

# Fast linter (Oxlint)
npm run lint
```

---

## Related Specifications
- [Architectural Invariants](../docs/architecture-invariants.md)
- [Protocol Specification](../docs/protocol.md)
- [Development & Testing Guide](../docs/DEVELOPMENT.md)
