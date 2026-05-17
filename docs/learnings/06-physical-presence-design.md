# Learning 06: Physical Presence Design (Milestone 3)

This design outlines our approach to achieving physical presence verification using Bluetooth Low Energy (BLE), effectively bridging the gap between digital trust and the physical world.

## 1. Architectural Strategy
We will introduce a `PresenceManager` layer to abstract hardware complexity, maintaining our "Agnostic Engine" philosophy.

- **BLE-HAL (Hardware Abstraction Layer):** Translates our signed packets into BLE-compatible advertisement packets.
- **PresenceManager:** The orchestrator that handles BLE state (Advertise/Scan) and filters by proximity (RSSI).
- **Identity Integration:** BLE beacons will be signed using our existing `IdentityManager` keys, ensuring that presence is always cryptographically verifiable.

## 2. The Presence Beacon Protocol
To keep packets small and privacy-preserving:
- **Identifier:** `STRATA_V1` (Protocol Version).
- **Short PubKey Hash:** First 8 bytes of the Public Key for quick contact matching.
- **Dynamic Nonce Signature:** A periodically rotating nonce signed by the Private Key to prevent physical tracking by malicious actors.

## 3. Workflow for UX
1. **Passive Discovery:** Nodos detectan dispositivos firmados por contactos de confianza mediante escaneo BLE.
2. **Proximity Filter:** Application filters results using RSSI (Received Signal Strength Indicator) to ensure only physically nearby users are actionable.
3. **Intentional Handshake:** Users must consciously initiate a handshake via the UI to establish a trust relationship.

---
*Code Reference:* Future development will occur in `src/strata/core/presence.py` and `src/strata/core/ble.py`.
