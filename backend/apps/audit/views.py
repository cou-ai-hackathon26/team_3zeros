from rest_framework import views, status, permissions
from rest_framework.response import Response
from .models import AuditEvent
from .serializers import AuditEventSerializer
from apps.common.pagination import CursorPagination

class AuditEventListView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        queryset = AuditEvent.objects.all()

        patient_param = request.query_params.get("patient")
        actor_param = request.query_params.get("actor")

        # Patients can only view audit events where patient_id matches their own patient record
        if hasattr(user, "patient_account"):
            patient_id = str(user.patient_account.patient.public_id)
            queryset = queryset.filter(patient_id=patient_id)
        elif not user.is_staff and not getattr(user, "is_platform_admin", False):
            # Non-admin facility staff or clinician can only see events for their facility or their actions
            queryset = queryset.filter(actor_user=user)

        if patient_param:
            queryset = queryset.filter(patient_id=patient_param)
        if actor_param:
            queryset = queryset.filter(actor_user__public_id=actor_param)

        paginator = CursorPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = AuditEventSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)
