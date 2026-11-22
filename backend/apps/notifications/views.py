from rest_framework import serializers, views, permissions, status
from rest_framework.response import Response
from django.utils import timezone
from .models import Notification
from apps.common.pagination import CursorPagination
from apps.common.exceptions import NotFoundError

class NotificationSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="public_id", read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "type", "title", "body", "object_ref", "channel", "state", "sent_at", "read_at", "created_at"]


class NotificationListView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        queryset = Notification.objects.filter(recipient=request.user)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = NotificationSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class NotificationReadView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        notif = Notification.objects.filter(public_id=public_id, recipient=request.user).first()
        if not notif:
            raise NotFoundError("Notification not found.")
        notif.state = "READ"
        notif.read_at = timezone.now()
        notif.save()
        return Response(NotificationSerializer(notif).data)

