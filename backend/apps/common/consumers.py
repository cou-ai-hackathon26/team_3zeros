"""
Django Channels WebSocket consumer for real-time events (MASTERPLAN §6.4).
Carries IDs and states only, never clinical content.
"""
import logging
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.layers import get_channel_layer
from channels.db import database_sync_to_async
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)


class EventConsumer(AsyncJsonWebsocketConsumer):
    """
    Subscribes authenticated users to real-time status channels:
    - user_{user_id}
    - facility_{facility_id} for active facility memberships
    """

    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        self.user_group = f"user_{user.id}"
        await self.channel_layer.group_add(self.user_group, self.channel_name)

        # Facility groups for staff/clinicians
        self.facility_groups = []

        @database_sync_to_async
        def get_facility_ids():
            return list(user.memberships.values_list("facility_id", flat=True))

        facility_ids = await get_facility_ids()
        for fac_id in facility_ids:
            fg = f"facility_{fac_id}"
            self.facility_groups.append(fg)
            await self.channel_layer.group_add(fg, self.channel_name)

        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "user_group"):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)
        if hasattr(self, "facility_groups"):
            for fg in self.facility_groups:
                await self.channel_layer.group_discard(fg, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Client messages (e.g. heartbeat ping)
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def event_broadcast(self, event):
        """Handler for events dispatched via channel layer group."""
        payload = {
            "type": event.get("event_type", "state_changed"),
            "id": event.get("id"),
            "state": event.get("state"),
            "version": event.get("version"),
        }
        if "action" in event:
            payload["action"] = event["action"]
        await self.send_json(payload)


def broadcast_event(group: str, event_type: str, payload: dict):
    """Helper to broadcast an event to a channel layer group from synchronous code."""
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            group,
            {
                "type": "event_broadcast",
                "event_type": event_type,
                **payload,
            },
        )
    except Exception as exc:
        logger.warning("broadcast_event failed for group %s: %s", group, exc)
