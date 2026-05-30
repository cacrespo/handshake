# Learning 05: Digital Metabolism & Storage

In a decentralized network without a central server to "delete" old data, how do we prevent our devices from filling up? We implement **Digital Metabolism**.

## 1. What is Metabolism?
Metabolism is the process by which the system automatically "digests" or deletes old data to make room for new information. In Strata, this is handled by the `StorageManager`.

## 2. Priority-Based Deletion (LRU)
The `StorageManager` enforces limits at two levels:
*   **Swarm Level:** Each "board" (geohashed location) has a maximum number of messages (default: 100). When a new message arrives, the oldest one is deleted.
*   **Global Level:** The total storage used by Strata is capped (default: 500MB). If reached, the system deletes the oldest messages across *all* swarms.

## 3. The ".keep" Mechanism (Persistent Memory)
Not all data is ephemeral. Some messages are important enough to keep forever (e.g., a "Golden Rule" for a community or a specific contact).
*   **Protection:** By adding a `.keep` suffix to a message file, it becomes "invisible" to the metabolism cleanup logic.
*   **Manual Intervention:** Users can mark messages to be kept, effectively pinning them to their local storage.

## 4. Why this matters?
*   **Device Health:** Strata is designed to run on mobile and low-power devices. Metabolism ensures the app never becomes a "storage hog."
*   **Data Freshness:** By deleting old messages, the network naturally prioritizes what is happening *now* in a specific location.
*   **Autonomous Operation:** The system manages its own resources without requiring the user to manually "clear cache."

---
*Code Reference:* See `src/strata/core/storage.py` to see the `cleanup()` and `mark_to_keep()` methods.
