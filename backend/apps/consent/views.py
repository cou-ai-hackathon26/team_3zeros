from rest_framework import views, permissions, status
from rest_framework.response import Response
from .models import ConsentRequest, Consent
from .serializers import ConsentRequestSerializer, ConsentSerializer
from .services import grant_consent_request, refuse_consent_request, revoke_consent
from apps.common.exceptions import NotFoundError, PermissionDeniedError

class PatientConsentsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        if not hasattr(user, "patient_account"):
            return Response({"consents": [], "pending_requests": []})

        patient = user.patient_account.patient
        consents = Consent.objects.filter(patient=patient)
        requests = ConsentRequest.objects.filter(patient=patient, state="PENDING")

        return Response({
            "consents": ConsentSerializer(consents, many=True).data,
            "pending_requests": ConsentRequestSerializer(requests, many=True).data,
        })


class ConsentRequestDetailView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        req = ConsentRequest.objects.filter(public_id=public_id).first()
        if not req:
            raise NotFoundError("Consent request not found.")
        user = request.user
        if hasattr(user, "patient_account"):
            if req.patient_id != user.patient_account.patient_id:
                raise PermissionDeniedError("Not authorized to view this consent request.")
        elif not (user.is_superuser or user.is_staff or hasattr(user, "platform_admin") or user.memberships.exists()):
            raise PermissionDeniedError("Not authorized to view this consent request.")
        return Response(ConsentRequestSerializer(req).data)


class GrantConsentRequestView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        request_id = getattr(request, "request_id", "")
        consent = grant_consent_request(request.user, public_id, request_id=request_id)
        return Response(ConsentSerializer(consent).data)


class RefuseConsentRequestView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        request_id = getattr(request, "request_id", "")
        req = refuse_consent_request(request.user, public_id, request_id=request_id)
        return Response(ConsentRequestSerializer(req).data)


class RevokeConsentView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id):
        request_id = getattr(request, "request_id", "")
        consent = revoke_consent(request.user, public_id, request_id=request_id)
        return Response(ConsentSerializer(consent).data)

