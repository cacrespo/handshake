# Handshake Development & Testing Guide

This guide covers setting up the local development environment, running the system components, executing automated test suites, and performing P2P synchronization verification across clients.

---

## 1. Prerequisites & Environment Setup

Handshake uses modern, reproducible tooling across its Python engine and TypeScript web client.

### Requirements:
*   **Python 3.13+** with **[uv](https://docs.astral.sh/uv/)** for fast, deterministic dependency management.
*   **Node.js 20+** and **npm** for the web frontend.

### Quick Start:
```bash
# Clone the repository
git clone https://github.com/cacrespo/handshake.git
cd handshake

# 1. Setup Python virtual environment and dependencies
uv sync

# 2. Setup Web Client dependencies
cd web
npm install
cd ..
```

---

## 2. Running Components Locally

Handshake consists of two primary runtime components for the Web MVP:
1.  **Space-Time Tracker Server (Django Channels / WebSocket):** Ephemeral matchmaking and P2P signaling coordinator.
2.  **Web Client (Vite / React):** Client interface with embedded local storage and direct WebRTC DataChannel transport.

### Step 1: Start the Tracker Server
In your first terminal:
```bash
uv run python src/manage.py runserver 0.0.0.0:8000
```
*The tracker will listen on `ws://localhost:8000/ws/tracker/`.*

### Step 2: Start the Web Client
In a second terminal:
```bash
cd web
npm run dev
```
*Open `http://localhost:5173` in your browser.*

---

## 3. Automated Test Suites & Continuous Verification

Before committing or submitting a pull request, run all verification suites from the repository root:

### 1. Python Unit & Cross-Language Tests
Runs core engine tests, cryptographic signature verification, and cross-language compatibility tests:
```bash
uv run pytest
```

### 2. Documentation Consistency & Architectural Drift Verifier
Ensures all Markdown links, architectural invariants, relational schemas, and serialization structures remain consistent:
```bash
uv run python scripts/verify_docs_consistency.py
```

### 3. Web Client Unit Tests & TypeScript Build
Verifies web sync logic, storage managers, utility functions, and production compilation:
```bash
cd web
npm test -- --run
npm run build
cd ..
```

---

## 4. Multi-Client P2P Verification (WebRTC)

To verify real-time, serverless peer-to-peer data synchronization:

1.  Start the Tracker server and Vite web client as described in Section 2.
2.  Open **two separate browser windows** (or one normal and one incognito window) pointing to `http://localhost:5173`.
3.  In both windows, ensure each client generates or loads an Ed25519 identity.
4.  Navigate both windows to the same geographical area (e.g. Buenos Aires, Obelisco) and temporal day.
5.  Check the live HUD indicator: the Tracker should match both peers in the same spatial cell (`geohash[:5]`) and establish a direct WebRTC DataChannel labeled `"strata-sync"`.
6.  **Publish a message in Window A:**
    - Click *"Pintar Graffiti"*, write a message, and publish.
7.  **Verify instant sync in Window B:**
    - The message will be announced via inventory negotiation and rendered on the map and timeline in Window B directly over WebRTC, without ever touching central database storage.
