# Learning 03: Geohashing & P2P Swarms

How do we turn a physical location into a digital room without a server? We use **Geohashing** and **BitTorrent Swarms**.

## 1. What is a Geohash?
A geohash is a way of encoding latitude and longitude into a short string of letters and numbers (e.g., `ezjmgu3`). 
*   **The Magic:** If two strings share the same prefix, they are geographically close. 
*   **Precision:** Longer strings represent smaller areas. A 7-character geohash is about 150m x 150m—perfect for a "town square" board.

## 2. From Geohash to InfoHash
BitTorrent uses an **InfoHash** (a 40-character hex string) to identify a swarm. In Strata, we derive this hash deterministically:

`InfoHash = SHA1(Geohash + Current_Month)`

Because the formula is public and deterministic, two people in the same square will calculate the **exact same InfoHash** and find each other through the BitTorrent DHT (Distributed Hash Table), even if they've never met.

## 3. Swarm Dynamics
*   **Decentralized Discovery:** We don't ask a server "who is at this location?". We ask the BitTorrent network "who is seeding this InfoHash?".
*   **Data Locality:** Since the InfoHash is tied to the location, users physically present at the square naturally become the "seeders" for that board's data.
*   **Organic Survival:** If a location is abandoned and no one seeds the InfoHash, the data eventually disappears from the network. This is the **Digital Metabolism**.

---
*Code Reference:* See `src/strata/core/geo.py` for geohash generation and `src/strata/core/swarm.py` for swarm management.
