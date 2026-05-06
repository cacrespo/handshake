import typer
import time
from typing import Optional
from cryptography.hazmat.primitives.asymmetric import ed25519
from strata.core.models import Message
from strata.core.geo import get_geohash, get_epoch_string
from strata.core.engine import StrataEngine

import logging

# Basic logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("strata")

app = typer.Typer(help="Strata: Geographic P2P Swarms")


# Dummy key management for Hito 1
def get_or_create_key():
    # In a real app, this would be stored in a secure file
    priv = ed25519.Ed25519PrivateKey.generate()
    pub = priv.public_key()
    return priv, pub


@app.command()
def write(
    content: str = typer.Argument(..., help="The message to leave on the wall"),
    lat: float = typer.Option(..., help="Latitude"),
    lon: float = typer.Option(..., help="Longitude"),
    precision: int = typer.Option(7, help="Geohash precision"),
    anchored_to: Optional[str] = typer.Option(
        None, help="Owner Public Key for anchored layers"
    ),
    storage_path: str = typer.Option("./storage", help="Path to storage"),
):
    """Leaves a digital trace at the specified location."""
    engine = StrataEngine(storage_path=storage_path)
    priv, pub = get_or_create_key()
    geohash = get_geohash(lat, lon, precision)

    msg = Message(
        author_pk=pub.public_bytes_raw(),
        geohash=geohash,
        content=content,
        message_type="ANCHORED" if anchored_to else "PUBLIC",
        owner_pk=bytes.fromhex(anchored_to) if anchored_to else None,
    )
    msg.sign(priv)

    # In a one-shot write, we just use the engine's storage to save it
    # and maybe trigger a quick swarm announcement if we were running a long process.
    # For Hito 1 simple CLI, engine.post_message is enough.
    engine.post_message(msg)

    typer.echo(f"🚀 Writing to {geohash} [Epoch: {get_epoch_string()}]")
    typer.echo("✅ Message signed and saved for propagation.")


@app.command()
def read(
    lat: float = typer.Option(..., help="Latitude"),
    lon: float = typer.Option(..., help="Longitude"),
    precision: int = typer.Option(7, help="Geohash precision"),
    storage_path: str = typer.Option("./storage", help="Path to storage"),
):
    """Reads messages from the local swarm for your current location."""
    engine = StrataEngine(storage_path=storage_path)
    geohash = get_geohash(lat, lon, precision)

    typer.echo(f"🔍 Reading layers at {geohash}")
    messages = engine.get_messages(lat, lon, precision)

    if not messages:
        typer.echo("📭 No messages found here yet.")
        return

    for i, m in enumerate(messages):
        time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(m.timestamp))
        typer.echo(f"--- {i + 1} ---")
        typer.echo(f"🕒 {time_str}")
        typer.echo(f"👤 {m.author_pk.hex()[:8]}...")
        typer.echo(f"📝 {m.content}")
        typer.echo("")


@app.command()
def node(
    lat: float = typer.Option(..., help="Latitude"),
    lon: float = typer.Option(..., help="Longitude"),
    precision: int = typer.Option(7, help="Geohash precision"),
    port: int = typer.Option(6882, help="Gossip port"),
    p2p_port: int = typer.Option(6881, help="P2P port"),
    storage_path: str = typer.Option("./storage", help="Path to storage"),
):
    """Starts a Strata node to seed and sync messages for a location."""
    engine = StrataEngine(
        storage_path=storage_path, 
        gossip_port=port, 
        p2p_port=p2p_port
    )
    
    engine.start(lat, lon, precision)

    typer.echo(f"🌐 Node active for {get_geohash(lat, lon, precision)}")
    typer.echo(f"📡 Local Sync: Active on port {port}")
    typer.echo(f"📂 Storage: {storage_path}")
    typer.echo("Press Ctrl+C to stop.")

    try:
        while True:
            # We can show some stats from the engine here
            # For now, just keep it running
            time.sleep(5)
            # Maybe show peer count from one of the active swarms
            for info_hash in engine.active_info_hashes:
                status = engine.swarm.get_swarm_status(info_hash)
                if status:
                    stats = f"Peers: {status.num_peers} | Down: {status.download_rate / 1000:.1f}kB/s | Up: {status.upload_rate / 1000:.1f}kB/s"
                    typer.echo(stats)

    except KeyboardInterrupt:
        typer.echo("Shutting down...")
        engine.stop()


if __name__ == "__main__":
    app()
