# Testing Guide: Multi-Device P2P Synchronization

Follow these steps to verify that Strata is correctly synchronizing messages across different machines over the network.

## 1. Installation (On Each Machine)

Ensure you have Python 3.13+ and `uv` installed.

```bash
# Sync dependencies
uv sync
```

## 2. Configure Identity and Trust

Each machine needs to know the public key of other machines to validate messages.

1. **Obtain Your Key:**
   On each machine, run:
   ```bash
   uv run strata handshake
   ```
   Copy the `Public Key` (e.g. `a1b2c3d4...`).

2. **Add Contacts:**
   On **Machine A**, add the public key of **Machine B**:
   ```bash
   uv run strata contact add <PK_MACHINE_B> "Friend-B"
   ```
   *(Repeat this process across machines to build your trust network).*

## 3. Launch the Network Node

For machines to discover each other, they must listen on the same geographic location (Geohash).

On **all** machines, launch the node:
```bash
uv run strata node --lat 40.41 --lon -3.70
```
*Keep this terminal running. You will see peer statistics and transfer rates.*

## 4. Message Testing

While the node is running in one terminal, open **another terminal** to interact:

1. **Write (Machine A):**
   ```bash
   uv run strata write "Hello from Machine A! P2P sync is operational." --lat 40.41 --lon -3.70
   ```

2. **Diagnostics (Optional - Any Machine):**
   Run the diagnostic script to verify peer connectivity:
   ```bash
   uv run python src/strata/diag.py
   ```

3. **Read (Machine B/C):**
   Wait 30-60 seconds for BitTorrent propagation and run:
   ```bash
   uv run strata read --lat 40.41 --lon -3.70
   ```
   *You should see the message with verified alias "Friend-A".*

## Troubleshooting
- **Peers: 0**: If no peers appear after 2 minutes, verify that port `6881` (TCP/UDP) is not blocked by a firewall.
- **Message Not Appearing**: BitTorrent depends on peer availability. Ensure Machine A is actively running the `node` process while Machine B attempts to read.

