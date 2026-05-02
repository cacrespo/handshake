# Project Guidelines: Handshake / Strata

## Tooling & Workflow
- **Package Manager:** Use `uv` for all project management, dependency handling, and virtual environments.
- **Linting & Formatting:** Use **Ruff** for all Python code. Always run `ruff check . --fix` and `ruff format .` before committing changes.
- **Language:** Python 3.12+ (managed via `uv`).
- **Core Strategy:** Agnostic-first development (CLI/Core) before mobile integration.
- **Testing:** Use `pytest` for all tests. Always run tests using `PYTHONPATH=src pytest`.
- **P2P:** BitTorrent-based swarms for geographic persistence.
- **Validation:** Phased approach (GPS -> Social -> Bluetooth PoP).

## Roadmap: Milestone 2 (Social Layer & Advanced Tuning)
- **Identity & Contacts**: Implement a contact management system using public keys (`Ed25519`) to establish trust graphs.
- **Social Relays**: Enable trusted contacts to share access to remote boards (Social Relay), providing immunity to metabolism for their messages.
- **Advanced Tuning**: Implement `strata tune` command for geographic and temporal sintonization (excavating historical strata).
- **Dual Operating Modes**:
    - **Neighbor Mode**: High-fidelity, real-time sync with local nodes.
    - **Tuning Mode**: Read-only extraction from remote boards, with aggressive metabolism for non-conserved data.
