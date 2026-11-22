from rest_framework import views, permissions
from rest_framework.response import Response
from .serializers import (
    AreaSerializer,
    SpecialtySerializer,
    FacilityDirectorySerializer,
    PractitionerDirectorySerializer,
)
from .selectors import list_areas, list_specialties, list_facilities, list_practitioners
from apps.common.pagination import CursorPagination

class AreaListView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        level = request.query_params.get("level")
        parent_id = request.query_params.get("parent")
        queryset = list_areas(level=level, parent_id=parent_id)
        serializer = AreaSerializer(queryset, many=True)
        return Response(serializer.data)


class SpecialtyListView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        queryset = list_specialties()
        serializer = SpecialtySerializer(queryset, many=True)
        return Response(serializer.data)


class FacilityDiscoveryView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        area_id = request.query_params.get("area")
        service_code = request.query_params.get("service")
        queryset = list_facilities(area_id=area_id, service_code=service_code)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = FacilityDirectorySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class PractitionerDiscoveryView(views.APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        area_id = request.query_params.get("area")
        specialty_code = request.query_params.get("specialty")
        facility_id = request.query_params.get("facility")
        queryset = list_practitioners(area_id=area_id, specialty_code=specialty_code, facility_id=facility_id)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = PractitionerDirectorySerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)
