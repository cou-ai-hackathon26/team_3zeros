from django.urls import path
from .views import (
    AreaListView,
    SpecialtyListView,
    FacilityDiscoveryView,
    PractitionerDiscoveryView,
)

urlpatterns = [
    path("areas", AreaListView.as_view(), name="directory-areas"),
    path("specialties", SpecialtyListView.as_view(), name="directory-specialties"),
    path("facilities", FacilityDiscoveryView.as_view(), name="directory-facilities"),
    path("practitioners", PractitionerDiscoveryView.as_view(), name="directory-practitioners"),
]
