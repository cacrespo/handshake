import hashlib
import pygeohash as pgh
from datetime import datetime
from typing import Optional

def get_geohash(lat: float, lon: float, precision: int = 7) -> str:
    """Converts coordinates to a geohash string."""
    return pgh.encode(lat, lon, precision=precision)

def get_epoch_string(dt: Optional[datetime] = None) -> str:
    """Returns the current epoch identifier (YYYY-MM)."""
    if dt is None:
        dt = datetime.now()
    return dt.strftime("%Y-%m")

def generate_info_hash(geohash: str, epoch: str, owner_pk: Optional[str] = None) -> str:
    """
    Generates a deterministic InfoHash for the BitTorrent swarm.
    Format: SHA1(geohash + epoch + [owner_pk])
    """
    base_str = f"{geohash}:{epoch}"
    if owner_pk:
        base_str += f":{owner_pk}"
    
    return hashlib.sha1(base_str.encode('utf-8')).hexdigest()

def get_location_bounds(geohash: str):
    """Returns the bounding box for a given geohash."""
    return pgh.decode_exactly(geohash)
