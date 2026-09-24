import time

from channels.testing import WebsocketCommunicator
from cryptography.hazmat.primitives.asymmetric import ed25519
from django.test import TransactionTestCase

from core_tracker.consumers import TrackerConsumer
from core_tracker.models import ActivePeer


class TrackerAuthenticationTests(TransactionTestCase):
    def setUp(self):
        self.priv_key = ed25519.Ed25519PrivateKey.generate()
        self.pub_bytes = self.priv_key.public_key().public_bytes_raw()
        self.peer_id = self.pub_bytes.hex()
        self.geohash = "69y7pg3"

    def _sign_registration(self, peer_id: str, geohash: str, timestamp: int, priv_key=None) -> str:
        key = priv_key or self.priv_key
        challenge = f"REGISTER:{peer_id}:{geohash}:{timestamp}".encode("utf-8")
        return key.sign(challenge).hex()

    async def test_valid_registration_and_db_presence(self):
        communicator = WebsocketCommunicator(TrackerConsumer.as_asgi(), "/ws/tracker/")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        ts = int(time.time())
        sig = self._sign_registration(self.peer_id, self.geohash, ts)

        await communicator.send_json_to({
            "type": "register",
            "peer_id": self.peer_id,
            "geohash": self.geohash,
            "timestamp": ts,
            "signature": sig,
        })

        response = await communicator.receive_json_from()
        self.assertEqual(response.get("type"), "peer_list")
        self.assertIn("peers", response)

        # Peer should be in DB
        peer_exists = await ActivePeer.objects.filter(peer_id=self.peer_id).aexists()
        self.assertTrue(peer_exists)

        # Disconnect and verify peer removal from DB
        await communicator.disconnect()
        peer_exists_after = await ActivePeer.objects.filter(peer_id=self.peer_id).aexists()
        self.assertFalse(peer_exists_after)

    async def test_missing_signature_rejected(self):
        communicator = WebsocketCommunicator(TrackerConsumer.as_asgi(), "/ws/tracker/")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        await communicator.send_json_to({
            "type": "register",
            "peer_id": self.peer_id,
            "geohash": self.geohash,
        })

        response = await communicator.receive_json_from()
        self.assertEqual(response.get("type"), "error")
        self.assertEqual(response.get("code"), "AUTH_FAILED")

        peer_exists = await ActivePeer.objects.filter(peer_id=self.peer_id).aexists()
        self.assertFalse(peer_exists)
        await communicator.disconnect()

    async def test_invalid_signature_rejected(self):
        communicator = WebsocketCommunicator(TrackerConsumer.as_asgi(), "/ws/tracker/")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        ts = int(time.time())
        # Bad signature hex of correct length
        bad_sig = "00" * 64

        await communicator.send_json_to({
            "type": "register",
            "peer_id": self.peer_id,
            "geohash": self.geohash,
            "timestamp": ts,
            "signature": bad_sig,
        })

        response = await communicator.receive_json_from()
        self.assertEqual(response.get("type"), "error")
        self.assertEqual(response.get("code"), "AUTH_FAILED")

        peer_exists = await ActivePeer.objects.filter(peer_id=self.peer_id).aexists()
        self.assertFalse(peer_exists)
        await communicator.disconnect()

    async def test_expired_timestamp_rejected(self):
        communicator = WebsocketCommunicator(TrackerConsumer.as_asgi(), "/ws/tracker/")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # 300 seconds in the past (> 120s limit)
        expired_ts = int(time.time()) - 300
        sig = self._sign_registration(self.peer_id, self.geohash, expired_ts)

        await communicator.send_json_to({
            "type": "register",
            "peer_id": self.peer_id,
            "geohash": self.geohash,
            "timestamp": expired_ts,
            "signature": sig,
        })

        response = await communicator.receive_json_from()
        self.assertEqual(response.get("type"), "error")
        self.assertEqual(response.get("code"), "AUTH_FAILED")

        peer_exists = await ActivePeer.objects.filter(peer_id=self.peer_id).aexists()
        self.assertFalse(peer_exists)
        await communicator.disconnect()

    async def test_spoofed_peer_id_rejected(self):
        communicator = WebsocketCommunicator(TrackerConsumer.as_asgi(), "/ws/tracker/")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        other_priv_key = ed25519.Ed25519PrivateKey.generate()

        ts = int(time.time())
        # Signed by other_priv_key but claiming self.peer_id
        sig = self._sign_registration(self.peer_id, self.geohash, ts, priv_key=other_priv_key)

        await communicator.send_json_to({
            "type": "register",
            "peer_id": self.peer_id,
            "geohash": self.geohash,
            "timestamp": ts,
            "signature": sig,
        })

        response = await communicator.receive_json_from()
        self.assertEqual(response.get("type"), "error")
        self.assertEqual(response.get("code"), "AUTH_FAILED")

        peer_exists = await ActivePeer.objects.filter(peer_id=self.peer_id).aexists()
        self.assertFalse(peer_exists)
        await communicator.disconnect()

    async def test_unauthenticated_signal_rejected(self):
        communicator = WebsocketCommunicator(TrackerConsumer.as_asgi(), "/ws/tracker/")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Send signal without registering
        await communicator.send_json_to({
            "type": "signal",
            "target": self.peer_id,
            "signal": {"candidate": "dummy"},
        })

        response = await communicator.receive_json_from()
        self.assertEqual(response.get("type"), "error")
        self.assertEqual(response.get("code"), "UNAUTHENTICATED")
        await communicator.disconnect()

    async def test_peer_joined_and_signaling_between_authenticated_peers(self):
        peer1_priv = ed25519.Ed25519PrivateKey.generate()
        peer1_id = peer1_priv.public_key().public_bytes_raw().hex()
        peer1_gh = "69y7pg3"

        peer2_priv = ed25519.Ed25519PrivateKey.generate()
        peer2_id = peer2_priv.public_key().public_bytes_raw().hex()
        peer2_gh = "69y7pba"  # same 5-char prefix '69y7p'

        comm1 = WebsocketCommunicator(TrackerConsumer.as_asgi(), "/ws/tracker/")
        connected1, _ = await comm1.connect()
        self.assertTrue(connected1)

        ts1 = int(time.time())
        sig1 = self._sign_registration(peer1_id, peer1_gh, ts1, priv_key=peer1_priv)
        await comm1.send_json_to({
            "type": "register",
            "peer_id": peer1_id,
            "geohash": peer1_gh,
            "timestamp": ts1,
            "signature": sig1,
        })
        resp1 = await comm1.receive_json_from()
        self.assertEqual(resp1["type"], "peer_list")
        self.assertEqual(len(resp1["peers"]), 0)

        # Peer 2 connects and registers in same area
        comm2 = WebsocketCommunicator(TrackerConsumer.as_asgi(), "/ws/tracker/")
        connected2, _ = await comm2.connect()
        self.assertTrue(connected2)

        ts2 = int(time.time())
        sig2 = self._sign_registration(peer2_id, peer2_gh, ts2, priv_key=peer2_priv)
        await comm2.send_json_to({
            "type": "register",
            "peer_id": peer2_id,
            "geohash": peer2_gh,
            "timestamp": ts2,
            "signature": sig2,
        })

        # Peer 2 receives peer_list containing Peer 1
        resp2 = await comm2.receive_json_from()
        self.assertEqual(resp2["type"], "peer_list")
        self.assertEqual(len(resp2["peers"]), 1)
        self.assertEqual(resp2["peers"][0]["peer_id"], peer1_id)

        # Peer 1 receives peer_joined event for Peer 2
        joined_event = await comm1.receive_json_from()
        self.assertEqual(joined_event["type"], "peer_joined")
        self.assertEqual(joined_event["peer_id"], peer2_id)

        # Peer 2 sends WebRTC signal to Peer 1
        await comm2.send_json_to({
            "type": "signal",
            "target": peer1_id,
            "signal": {"type": "offer", "sdp": "v=0..."},
        })

        # Peer 1 receives the signal
        signal_event = await comm1.receive_json_from()
        self.assertEqual(signal_event["type"], "signal")
        self.assertEqual(signal_event["sender"], peer2_id)
        self.assertEqual(signal_event["signal"]["sdp"], "v=0...")

        # Disconnect Peer 2 -> Peer 1 receives peer_left
        await comm2.disconnect()
        left_event = await comm1.receive_json_from()
        self.assertEqual(left_event["type"], "peer_left")
        self.assertEqual(left_event["peer_id"], peer2_id)

        await comm1.disconnect()
