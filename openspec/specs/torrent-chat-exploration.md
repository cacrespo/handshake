# Exploration: P2P-based Public Boards (Geocast Swarms)

## Vision
Instead of focusing on private messaging, Handshake uses P2P technology to create **digital bulletin boards anchored to geography**. The network is incentivized through a shared interest in a physical location.

## Key Concepts
- **Geocast Swarm**: A "swarm" of users who share and maintain data for a public board associated with a GPS coordinate or Geohash.
- **Proof of Presence (PoP)**: A message is only accepted into the swarm if the sender can validate (via Bluetooth or GPS) that they are within the board's radius.
- **Community Seeding**: Users who frequent a place act as temporary storage nodes, allowing other users to "download" the board's history upon arrival.
- **Site Memory**: The board lives as long as there are people interested in maintaining it. If a place is abandoned, its digital footprint disappears organically (running out of seeders).

## Operational Dynamics
1. **Discovery**: Upon entering a board's radius, the device detects the `InfoHash` of the location (e.g., Main Square).
2. **Synchronization**: The device downloads the latest messages from nearby "seeders" (other users or fixed nodes).
3. **Contribution**: When posting, the message propagates via a *gossip protocol* to others present, who then add it to their local copy of the board's "torrent."

## The Balance: Local vs. Distant

To resolve the tension between physical proximity and interest in high-quality remote communities, Handshake proposes the concept of **Human Bridges**.

### Connectivity Concepts
- **Social Relays**: People act as data carriers. If a contact of yours (with whom you've performed a handshake) frequents a distant board, your device can start to "listen" and "seed" that board through them.
- **Trust-based Access**: There is no global search engine for boards. You discover remote communities because someone in your trust network (your circle of handshakes) shares access with you.
- **Historical Anchor**: If you visit a place physically, you obtain a "permanence key" that allows you to stay connected to that board remotely, acting as a support node for that community.

### Quality Dynamics
Quality in distant boards is not maintained by central moderators but by **network reputation**:
- A distant board only reaches you if it has enough "seeders" in your extended network.
- Mediocre boards die due to lack of social propagation; high-quality ones expand organically from hand to hand (handshake to handshake).

## Questions / Lines of Investigation
1. **Board Governance**: Who decides which messages stay? Could there be a "voting" system that prioritizes which torrent pieces are seeded more?
2. **Infrastructure Nodes**: Could local businesses (cafes, libraries) offer "Courtesy Seeding" to ensure their board never dies?
3. **Trajectory Privacy**: By acting as a "Social Relay" for a distant board, am I revealing who I've handshaked with and which places my friends frequent?
4. **Remote Writing**: Should someone not present be allowed to post? Perhaps with a reputation cost or via an "endorsement" from a present user.

## Analogies
- **Graffiti**: A mark left on a wall that others see as they pass by. If the wall crumbles or no one looks at it, the graffiti disappears.
- **The Town Square**: A place where information flows only if there are people present to hear and repeat it.
