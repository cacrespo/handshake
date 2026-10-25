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
5.  Check the live HUD indicator: the Tracker should match both peers in the same spatial cell (`geohash[:5]`) and establish a direct WebRTC DataChannel labeled `"handshake-sync"`.
6.  **Publish a message in Window A:**
    - Click *"Publicar Mensaje"*, write a message, and publish.
7.  **Verify instant sync in Window B:**
    - The message will be announced via inventory negotiation and rendered on the map and timeline in Window B directly over WebRTC, without ever touching central database storage.

---

## 5. Reference Storage Engine Implementation (DuckDB SQL)

For the Python CLI and background node engine (`src/strata/core/storage.py`), local sovereign persistence is implemented using an embedded [DuckDB](https://duckdb.org/) database. Other clients (such as the web frontend with IndexedDB or mobile with SQLite) may choose alternative engines as long as they satisfy the data model and metabolism requirements defined in [Protocol Specification](protocol.md#6-sovereign-storage-and-metabolism-specification).

### Reference Database Schemas:

#### 1. Messages Table (`graffitis`)
```sql
CREATE TABLE IF NOT EXISTS graffitis (
    signature VARCHAR PRIMARY KEY,         -- Unique Ed25519 message signature
    author_pk VARCHAR NOT NULL,           -- Author public key
    parent_signature VARCHAR,             -- Parent message signature (for threads)
    timestamp BIGINT NOT NULL,            -- UNIX timestamp
    geohash VARCHAR NOT NULL,             -- Spatial geohash (e.g. 'dr5reg6')
    lat DOUBLE NOT NULL,                  -- Latitude
    lon DOUBLE NOT NULL,                  -- Longitude
    content_text TEXT NOT NULL,           -- Message text content
    attachments_json JSON,                -- Serialized multimedia attachments
    is_pinned BOOLEAN DEFAULT FALSE,      -- Pinned flag for storage custody
    raw_json JSON NOT NULL                -- Canonical JSON payload for P2P re-seeding
);

CREATE INDEX IF NOT EXISTS idx_spatial ON graffitis(geohash);
CREATE INDEX IF NOT EXISTS idx_time ON graffitis(timestamp);
CREATE INDEX IF NOT EXISTS idx_parent ON graffitis(parent_signature);
```

#### 2. Trusted Handshakes Table (`trusted_handshakes`)
```sql
CREATE TABLE IF NOT EXISTS trusted_handshakes (
    public_key VARCHAR PRIMARY KEY,      -- Ed25519 public key of contact
    alias VARCHAR,                      -- Locally assigned alias/name
    added_at BIGINT NOT NULL,           -- UNIX timestamp when handshake was established
    qr_verified BOOLEAN DEFAULT TRUE    -- Verified via QR exchange or local pairing
);
```

### Reference Queries:

1. **Space-Time Retrieval for Viewport:**
   ```sql
   SELECT * FROM graffitis
   WHERE geohash LIKE 'dr5re%'
     AND timestamp BETWEEN :start_ts AND :end_ts
   ORDER BY timestamp DESC;
   ```

2. **Recursive Conversation Thread Reconstruction:**
   ```sql
   WITH RECURSIVE thread AS (
       SELECT * FROM graffitis WHERE signature = :target_signature
       UNION ALL
       SELECT g.* FROM graffitis g
       JOIN thread t ON g.parent_signature = t.signature
   )
   SELECT * FROM thread ORDER BY timestamp ASC;
   ```

3. **Storage Metabolism and Purge Policy (Configurable Limit):**
   ```sql
   -- Purge oldest messages that are neither pinned nor from trusted Handshake contacts
   DELETE FROM graffitis
   WHERE is_pinned = FALSE
     AND author_pk NOT IN (SELECT public_key FROM trusted_handshakes)
     AND signature IN (
         SELECT signature FROM graffitis
         WHERE is_pinned = FALSE
           AND author_pk NOT IN (SELECT public_key FROM trusted_handshakes)
         ORDER BY timestamp ASC
         LIMIT :purge_count
     );
   ```
