import requests
from django.conf import settings
from apps.common.exceptions import FhirUnavailableError

class FhirClient:
    """
    Client interface for HAPI FHIR server per BACKEND §5.
    """
    def __init__(self, base_url=None, timeout=None):
        self.base_url = base_url or getattr(settings, "FHIR_SERVER_URL", "http://localhost:8080/fhir")
        self.timeout = timeout or getattr(settings, "FHIR_TIMEOUT_SECONDS", 5)

    def get_resource(self, resource_type: str, fhir_id: str) -> dict:
        url = f"{self.base_url.rstrip('/')}/{resource_type}/{fhir_id}"
        try:
            resp = requests.get(url, headers={"Accept": "application/fhir+json"}, timeout=self.timeout)
            if resp.status_code == 200:
                return resp.json()
            elif resp.status_code == 404:
                return None
            else:
                raise FhirUnavailableError(f"FHIR server error: {resp.status_code}")
        except requests.RequestException as e:
            raise FhirUnavailableError(f"Cannot connect to FHIR server: {e}")

    def create_resource(self, resource_type: str, resource_data: dict) -> dict:
        url = f"{self.base_url.rstrip('/')}/{resource_type}"
        try:
            resp = requests.post(
                url,
                json=resource_data,
                headers={"Content-Type": "application/fhir+json", "Accept": "application/fhir+json"},
                timeout=self.timeout,
            )
            if resp.status_code in (200, 201):
                return resp.json()
            else:
                raise FhirUnavailableError(f"FHIR write rejected: {resp.status_code} {resp.text}")
        except requests.RequestException as e:
            raise FhirUnavailableError(f"Cannot connect to FHIR server: {e}")

    def execute_transaction_bundle(self, bundle: dict) -> dict:
        url = self.base_url.rstrip('/')
        try:
            resp = requests.post(
                url,
                json=bundle,
                headers={"Content-Type": "application/fhir+json", "Accept": "application/fhir+json"},
                timeout=self.timeout,
            )
            if resp.status_code in (200, 201):
                return resp.json()
            else:
                raise FhirUnavailableError(f"FHIR transaction bundle failed: {resp.status_code}")
        except requests.RequestException as e:
            raise FhirUnavailableError(f"Cannot connect to FHIR server: {e}")

