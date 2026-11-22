import pytest
from rest_framework.test import APIClient
from apps.directory.models import Area, Specialty, Service, CapacityReport
from apps.organizations.models import Facility, Practitioner, PractitionerRole

@pytest.fixture
def api_client():
    return APIClient()

@pytest.mark.django_db
def test_directory_endpoints(api_client):
    div = Area.objects.create(level="division", name_en="Dhaka", name_bn="ঢাকা", code="30")
    dist = Area.objects.create(level="district", parent=div, name_en="Gazipur", name_bn="গাজীপুর", code="33")

    spec = Specialty.objects.create(code="pediatrics", name_en="Pediatrics", name_bn="শিশু রোগ")

    fac = Facility.objects.create(name="Gazipur Sadar Hospital", name_bn="গাজীপুর সদর হাসপাতাল", area=dist)
    Service.objects.create(facility=fac, code="emergency", name="24/7 Emergency")
    CapacityReport.objects.create(facility=fac, reported_value={"beds": 12}, source="manual")

    # 1. Areas
    resp = api_client.get("/api/v1/directory/areas")
    assert resp.status_code == 200
    assert len(resp.data) == 2

    # 2. Specialties
    resp = api_client.get("/api/v1/directory/specialties")
    assert resp.status_code == 200
    assert len(resp.data) == 1

    # 3. Facilities discovery
    resp = api_client.get("/api/v1/directory/facilities")
    assert resp.status_code == 200
    assert "results" in resp.data
    assert len(resp.data["results"]) == 1
    assert resp.data["results"][0]["name"] == "Gazipur Sadar Hospital"
