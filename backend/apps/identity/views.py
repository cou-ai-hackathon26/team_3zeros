from django.db import transaction
from rest_framework import views, permissions, status
from rest_framework.response import Response
from .serializers import (
    PatientSerializer,
    PatientCreateSerializer,
    DuplicateCandidateSerializer,
    ResolveDuplicateSerializer,
)
from .selectors import (
    get_patient_by_public_id,
    search_patients,
    get_duplicate_candidates_for_patient,
)
from .services import create_patient_record, resolve_duplicate_candidate
from apps.common.idempotency import resolve_idempotent_replay, persist_idempotent_response
from apps.common.pagination import CursorPagination

class PatientListCreateView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query_str = request.query_params.get("q")
        queryset = search_patients(request.user, query_str=query_str)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = PatientSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        replayed = resolve_idempotent_replay(request)
        if replayed is not None:
            return replayed
        serializer = PatientCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_id = getattr(request, "request_id", "")
        with transaction.atomic():
            patient = create_patient_record(request.user, serializer.validated_data, request_id=request_id)
            response = Response(PatientSerializer(patient).data, status=status.HTTP_201_CREATED)
            persist_idempotent_response(request, response)
        return response


class PatientDetailView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        patient = get_patient_by_public_id(request.user, public_id)
        return Response(PatientSerializer(patient).data)


class PatientDuplicateCandidatesView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, public_id):
        patient = get_patient_by_public_id(request.user, public_id)
        candidates = get_duplicate_candidates_for_patient(patient)
        serializer = DuplicateCandidateSerializer(candidates, many=True)
        return Response(serializer.data)


class ResolveDuplicateCandidateView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, public_id, candidate_id):
        patient = get_patient_by_public_id(request.user, public_id)
        serializer = ResolveDuplicateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_id = getattr(request, "request_id", "")
        candidate = resolve_duplicate_candidate(
            request.user,
            candidate_id,
            serializer.validated_data["status"],
            notes=serializer.validated_data.get("notes", ""),
            request_id=request_id,
        )
        return Response(DuplicateCandidateSerializer(candidate).data)

