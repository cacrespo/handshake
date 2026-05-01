# Project Guidelines: Handshake / Strata

## Tooling & Workflow
- **Package Manager:** Use `uv` for all project management, dependency handling, and virtual environments.
- **Linting & Formatting:** Use **Ruff** for all Python code. Always run `ruff check . --fix` and `ruff format .` before committing changes.
- **Language:** Python 3.12+ (managed via `uv`).
- **Core Strategy:** Agnostic-first development (CLI/Core) before mobile integration.
- **Testing:** Use `pytest` for all tests. Always run tests using `PYTHONPATH=src pytest`.
- **P2P:** BitTorrent-based swarms for geographic persistence.
- **Validation:** Phased approach (GPS -> Social -> Bluetooth PoP).
