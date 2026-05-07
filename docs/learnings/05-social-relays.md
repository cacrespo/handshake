# Learning 05: Social Relays

Social Relays are the core of our P2P sync strategy. They allow your node to extend its "perception" beyond your physical location by piggybacking on the presence of your trusted contacts.

## 1. Discovery Mechanism
When nodes exchange inventories, they now include a `relays` list—a set of InfoHashes they are persistently seeding. 
- **Inventory Handshake:** When your node receives an inventory, it checks if the sender is a **Trusted Contact** (via `ContactBook`).
- **Discovery Callback:** If the peer is trusted and declares relays, the `SyncEngine` triggers an `on_discovery` callback.

## 2. Syncing Distant Boards
Once a remote swarm is discovered through a contact:
- **Automatic Joining:** The `StrataEngine` identifies these swarms and adds them to its `swarm_manager`.
- **Background Seeding:** Your node becomes a secondary seeder for those distant boards, keeping the data alive and accessible even if the original contact goes offline.

## 3. Benefits
- **No Global Tracker:** You don't need a central server to know what's happening elsewhere; you only need to know who is there.
- **Privacy:** You only sync content that your *trusted* contacts deem important enough to relay.
- **Resilience:** The network becomes a living web of persistent data, sustained by human social connections.

---
*Code Reference:* Check `src/strata/core/sync.py` for inventory extensions and `src/strata/core/engine.py` for the relay orchestration logic.
