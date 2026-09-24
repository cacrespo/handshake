# ruff: noqa: E402
import asyncio
import os
import sys
import time
from pathlib import Path

# Ensure tracker is in Python path and Django is configured
TRACKER_DIR = Path(__file__).resolve().parent.parent / "tracker"
if str(TRACKER_DIR) not in sys.path:
    sys.path.insert(0, str(TRACKER_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "tracker.settings")
import django

django.setup()

from channels.testing import WebsocketCommunicator
from cryptography.hazmat.primitives.asymmetric import ed25519
from core_tracker.consumers import TrackerConsumer
from core_tracker.models import ActivePeer


def _sign(peer_id: str, geohash: str, timestamp: int, priv_key) -> str:
    challenge = f"REGISTER:{peer_id}:{geohash}:{timestamp}".encode("utf-8")
    return priv_key.sign(challenge).hex()


def test_tracker_valid_registration_and_teardown():
    async def _run():
        priv_key = ed25519.Ed25519PrivateKey.generate()
        pub_hex = priv_key.public_key().public_bytes_raw().hex()
        geohash = "69y7pg3"
        ts = int(time.time())
        sig = _sign(pub_hex, geohash, ts, priv_key)

        comm = WebsocketCommunicator(TrackerConsumer.as_asgi(), "/ws/tracker/")
        connected, _ = await comm.connect()
        assert connected

        await comm.send_json_to({
            "type": "register",
            "peer_id": pub_hex,
            "geohash": geohash,
            "timestamp": ts,
            "signature": sig,
        })

        resp = await comm.receive_json_from()
        assert resp["type"] == "peer_list"

        exists = await ActivePeer.objects.filter(peer_id=pub_hex).aexists()
        assert exists is True

        await comm.disconnect()
        exists_after = await ActivePeer.objects.filter(peer_id=pub_hex).aexists()
        assert exists_after is False

    asyncio.run(_run())


def test_tracker_unauthenticated_registration_rejected():
    async def _run():
        comm = WebsocketCommunicator(TrackerConsumer.as_asgi(), "/ws/tracker/")
        connected, _ = await comm.connect()
        assert connected

        # Registration without signature
        await comm.send_json_to({
            "type": "register",
            "peer_id": "aa" * 32,
            "geohash": "69y7pg3",
        })
        resp = await comm.receive_json_from()
        assert resp["type"] == "error"
        assert resp["code"] == "AUTH_FAILED"

        # Signal without authenticating
        await comm.send_json_to({
            "type": "signal",
            "target": "bb" * 32,
            "signal": {"candidate": "dummy"},
        })
        resp_sig = await comm.receive_json_from()
        assert resp_sig["type"] == "error"
        assert resp_sig["code"] == "UNAUTHENTICATED"

        await comm.disconnect()

    asyncio.run(_run())


def test_tracker_expired_timestamp_rejected():
    async def _run():
        priv_key = ed25519.Ed25519PrivateKey.generate()
        pub_hex = priv_key.public_key().public_bytes_raw().hex()
        geohash = "69y7pg3"
        expired_ts = int(time.time()) - 300
        sig = _sign(pub_hex, geohash, expired_ts, priv_key)

        comm = WebsocketCommunicator(TrackerConsumer.as_asgi(), "/ws/tracker/")
        connected, _ = await comm.connect()
        assert connected

        await comm.send_json_to({
            "type": "register",
            "peer_id": pub_hex,
            "geohash": geohash,
            "timestamp": expired_ts,
            "signature": sig,
        })

        resp = await comm.receive_json_from()
        assert resp["type"] == "error"
        assert resp["code"] == "AUTH_FAILED"

        exists = await ActivePeer.objects.filter(peer_id=pub_hex).aexists()
        assert exists is False

        await comm.disconnect()

    asyncio.run(_run())
