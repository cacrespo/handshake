from django.db import models

class ActivePeer(models.Model):
    peer_id = models.CharField(max_length=255, unique=True, primary_key=True)
    geohash = models.CharField(max_length=12, db_index=True)
    channel_name = models.CharField(max_length=255)
    last_seen = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.peer_id} @ {self.geohash}"
