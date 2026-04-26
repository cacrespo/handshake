# Project Guidelines: Handshake / Strata

## Tooling & Workflow
- **Package Manager:** Use `uv` for all project management, dependency handling, and virtual environments.
- **Language:** Python 3.12+ (managed via `uv`).
- **Core Strategy:** Agnostic-first development (CLI/Core) before mobile integration.
- **P2P:** BitTorrent-based swarms for geographic persistence.
- **Validation:** Phased approach (GPS -> Social -> Bluetooth PoP).
