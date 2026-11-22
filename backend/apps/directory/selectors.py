from django.db.models import Q
from .models import Area, Specialty, Service, CapacityReport
from apps.organizations.models import Facility, Practitioner

def list_areas(level=None, parent_id=None):
    queryset = Area.objects.all()
    if level:
        queryset = queryset.filter(level=level)
    if parent_id:
        queryset = queryset.filter(parent__public_id=parent_id)
    return queryset

def list_specialties():
    return Specialty.objects.all()

def list_facilities(area_id=None, service_code=None):
    queryset = Facility.objects.prefetch_related("services", "capacity_reports").select_related("area").all()
    if area_id:
        queryset = queryset.filter(Q(area__public_id=area_id) | Q(area__parent__public_id=area_id))
    if service_code:
        queryset = queryset.filter(services__code=service_code)
    return queryset.distinct()

def list_practitioners(area_id=None, specialty_code=None, facility_id=None):
    queryset = Practitioner.objects.prefetch_related("roles__specialty", "roles__facility").all()
    if area_id:
        queryset = queryset.filter(
            Q(roles__facility__area__public_id=area_id) | Q(roles__facility__area__parent__public_id=area_id)
        )
    if specialty_code:
        queryset = queryset.filter(roles__specialty__code=specialty_code)
    if facility_id:
        queryset = queryset.filter(roles__facility__public_id=facility_id)
    return queryset.distinct()
