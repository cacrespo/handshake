import json
import time

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from cryptography.hazmat.primitives.asymmetric import ed25519

from core_tracker.models import ActivePeer

MAX_TIMESTAMP_SKEW_SECONDS = 120


def verify_registration_signature(
    peer_id: str,
    geohash: str,
    timestamp: int | float | str,
    signature: str,
    max_skew_seconds: int = MAX_TIMESTAMP_SKEW_SECONDS,
) -> bool:
    """Verifies that the registration message was signed by the private key
    corresponding to peer_id (Ed25519 public key in 64-hex format).

    The signed challenge is: 'REGISTER:<peer_id>:<geohash>:<int(timestamp)>'
    """
    try:
        now = time.time()
        ts = int(float(timestamp))
        if abs(now - ts) > max_skew_seconds:
            return False

        if not isinstance(peer_id, str) or len(peer_id) != 64:
            return False

        if not isinstance(signature, str) or len(signature) != 128:
            return False

        pub_bytes = bytes.fromhex(peer_id)
        sig_bytes = bytes.fromhex(signature)

        challenge = f"REGISTER:{peer_id}:{geohash}:{ts}".encode("utf-8")
        pub_key = ed25519.Ed25519PublicKey.from_public_bytes(pub_bytes)
        pub_key.verify(sig_bytes, challenge)
        return True
    except Exception:
        return False


class TrackerConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        self.peer_id = None
        self.geohash = None

    async def disconnect(self, close_code):
        if self.peer_id:
            # Remove peer from database
            geohash = await self.unregister_peer(self.peer_id)
            if geohash:
                # Notify neighbors that we left
                await self.notify_neighbors(geohash, {
                    "type": "peer_left",
                    "peer_id": self.peer_id
                })

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        msg_type = data.get("type")

        if msg_type == "register":
            peer_id = data.get("peer_id")
            geohash = data.get("geohash")
            timestamp = data.get("timestamp")
            signature = data.get("signature")

            if not peer_id or not geohash or timestamp is None or not signature:
                await self.send(text_data=json.dumps({
                    "type": "error",
                    "code": "AUTH_FAILED",
                    "message": "Missing required registration fields (peer_id, geohash, timestamp, signature)"
                }))
                return

            if not verify_registration_signature(peer_id, geohash, timestamp, signature):
                await self.send(text_data=json.dumps({
                    "type": "error",
                    "code": "AUTH_FAILED",
                    "message": "Invalid registration signature or expired timestamp"
                }))
                return

            if self.peer_id and self.peer_id != peer_id:
                await self.send(text_data=json.dumps({
                    "type": "error",
                    "code": "AUTH_FAILED",
                    "message": "Cannot re-register with different peer_id on same connection"
                }))
                return

            # Si el peer ya estaba registrado y cambia de zona (geohash[:5]), dejamos la sala anterior y notificamos la partida.
            if self.peer_id and self.geohash and self.geohash[:5] != geohash[:5]:
                old_room = f"geo_{self.geohash[:5]}"
                await self.channel_layer.group_discard(
                    old_room,
                    self.channel_name
                )
                await self.notify_neighbors(self.geohash, {
                    "type": "peer_left",
                    "peer_id": self.peer_id
                })

            self.peer_id = peer_id
            self.geohash = geohash

            # Register in database
            await self.register_peer(peer_id, geohash, self.channel_name)

            # Join geohash room group so we can receive broadcast messages for this area
            # We use first 5 chars of geohash (approx 4.9km x 4.9km zone)
            self.room_group_name = f"geo_{geohash[:5]}"
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )

            # Get other peers in the same zone
            peers = await self.get_nearby_peers(peer_id, geohash)

            # Send the list of peers back to the newly registered peer
            await self.send(text_data=json.dumps({
                "type": "peer_list",
                "peers": peers
            }))

            # Notify others in the group that we joined
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "peer_joined_message",
                    "sender_channel_name": self.channel_name,
                    "peer_id": peer_id,
                    "geohash": geohash
                }
            )

        elif msg_type == "signal":
            if not self.peer_id:
                await self.send(text_data=json.dumps({
                    "type": "error",
                    "code": "UNAUTHENTICATED",
                    "message": "Must register and authenticate before sending signaling messages"
                }))
                return

            target_peer_id = data.get("target")
            signal_data = data.get("signal")

            if not target_peer_id or not signal_data:
                return

            # Find target's channel name
            target_channel = await self.get_peer_channel(target_peer_id)
            if target_channel:
                await self.channel_layer.send(
                    target_channel,
                    {
                        "type": "signal_message",
                        "sender": self.peer_id,
                        "signal": signal_data
                    }
                )

    # Handlers for group messages

    async def peer_joined_message(self, event):
        # Don't notify ourselves
        if event["sender_channel_name"] != self.channel_name:
            await self.send(text_data=json.dumps({
                "type": "peer_joined",
                "peer_id": event["peer_id"],
                "geohash": event["geohash"]
            }))

    async def signal_message(self, event):
        await self.send(text_data=json.dumps({
            "type": "signal",
            "sender": event["sender"],
            "signal": event["signal"]
        }))

    # Database Helpers

    @database_sync_to_async
    def register_peer(self, peer_id, geohash, channel_name):
        ActivePeer.objects.update_or_create(
            peer_id=peer_id,
            defaults={"geohash": geohash, "channel_name": channel_name}
        )

    @database_sync_to_async
    def unregister_peer(self, peer_id):
        try:
            peer = ActivePeer.objects.get(peer_id=peer_id)
            geohash = peer.geohash
            peer.delete()
            return geohash
        except ActivePeer.DoesNotExist:
            return None

    @database_sync_to_async
    def get_nearby_peers(self, peer_id, geohash):
        # Prefix match 5 chars
        prefix = geohash[:5]
        peers = ActivePeer.objects.filter(geohash__startswith=prefix).exclude(peer_id=peer_id)
        return [{"peer_id": p.peer_id, "geohash": p.geohash} for p in peers]

    @database_sync_to_async
    def get_peer_channel(self, peer_id):
        try:
            return ActivePeer.objects.get(peer_id=peer_id).channel_name
        except ActivePeer.DoesNotExist:
            return None

    async def notify_neighbors(self, geohash, message):
        group_name = f"geo_{geohash[:5]}"
        await self.channel_layer.group_send(
            group_name,
            {
                "type": "peer_left_message",
                "sender_channel_name": self.channel_name,
                "message": message
            }
        )

    async def peer_left_message(self, event):
        if event["sender_channel_name"] != self.channel_name:
            await self.send(text_data=json.dumps(event["message"]))
