import typer
import time
from typing import Optional
from cryptography.hazmat.primitives.asymmetric import ed25519
from strata.core.models import Message
from strata.core.geo import get_geohash, get_epoch_string, generate_info_hash
from strata.core.swarm import SwarmManager
from strata.core.storage import StorageManager
from strata.core.sync import SyncEngine

app = typer.Typer(help="Strata: Geographic P2P Swarms")
storage = StorageManager()

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
    anchored_to: Optional[str] = typer.Option(None, help="Owner Public Key for anchored layers")
):
    """Leaves a digital trace at the specified location."""
    priv, pub = get_or_create_key()
    geohash = get_geohash(lat, lon, precision)
    epoch = get_epoch_string()
    
    msg = Message(
        author_pk=pub.public_bytes_raw(),
        geohash=geohash,
        content=content,
        message_type="ANCHORED" if anchored_to else "PUBLIC",
        owner_pk=bytes.fromhex(anchored_to) if anchored_to else None
    )
    msg.sign(priv)
    
    info_hash = generate_info_hash(geohash, epoch, anchored_to)
    
    # Save to physical storage
    path = storage.save_message(info_hash, msg)
    
    typer.echo(f"🚀 Writing to {geohash} [Epoch: {epoch}]")
    typer.echo(f"📍 InfoHash: {info_hash}")
    typer.echo(f"💾 Saved to: {path}")
    typer.echo("✅ Message signed and saved for propagation.")

@app.command()
def read(
    lat: float = typer.Option(..., help="Latitude"),
    lon: float = typer.Option(..., help="Longitude"),
    precision: int = typer.Option(7, help="Geohash precision")
):
    """Reads messages from the local swarm for your current location."""
    geohash = get_geohash(lat, lon, precision)
    epoch = get_epoch_string()
    info_hash = generate_info_hash(geohash, epoch)
    
    typer.echo(f"🔍 Reading layers at {geohash} [InfoHash: {info_hash}]")
    messages = storage.load_messages(info_hash)
    
    if not messages:
        typer.echo("📭 No messages found here yet.")
        return

    for i, m in enumerate(messages):
        time_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(m.timestamp))
        typer.echo(f"--- {i+1} ---")
        typer.echo(f"🕒 {time_str}")
        typer.echo(f"👤 {m.author_pk.hex()[:8]}...")
        typer.echo(f"📝 {m.content}")
        typer.echo("")

@app.command()
def node(
    lat: float = typer.Option(..., help="Latitude"),
    lon: float = typer.Option(..., help="Longitude"),
    precision: int = typer.Option(7, help="Geohash precision")
):
    """Starts a Strata node to seed and sync messages for a location."""
    geohash = get_geohash(lat, lon, precision)
    epoch = get_epoch_string()
    info_hash = generate_info_hash(geohash, epoch)
    
    # Start Swarm (Global P2P)
    swarm = SwarmManager()
    handle = swarm.start_swarm(info_hash)
    
    # Start SyncEngine (Local Gossip)
    sync = SyncEngine(storage)
    sync.start()
    
    typer.echo(f"🌐 Node active for {geohash}")
    typer.echo(f"⚡ Global Seeding: {info_hash}")
    typer.echo(f"📡 Local Sync: Active on port {sync.port}")
    typer.echo("Press Ctrl+C to stop.")
    
    try:
        while True:
            s = handle.status()
            stats = f"Peers: {s.num_peers} | Down: {s.download_rate/1000:.1f}kB/s | Up: {s.upload_rate/1000:.1f}kB/s"
            typer.echo(stats, err=True)
            time.sleep(5)
    except KeyboardInterrupt:
        typer.echo("Shutting down...")
        sync.stop()
        swarm.stop_all()

if __name__ == "__main__":
    app()
