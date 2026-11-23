import pytest
from rest_framework.test import APIClient
from apps.accounts.models import User
from apps.notifications.models import Notification
from apps.notifications.sms import send_sms, validate_sms_body_non_clinical
from apps.common.exceptions import ValidationError


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(email="testuser@example.com", password="password123")


def test_sms_validation_rejects_clinical_details():
    with pytest.raises(ValidationError) as exc:
        validate_sms_body_non_clinical("Your diagnosis is tuberculosis. Take 500mg daily.")
    assert "SECURITY §7 violation" in str(exc.value)

    with pytest.raises(ValidationError) as exc:
        validate_sms_body_non_clinical("Lab result positive for diabetes.")
    assert "SECURITY §7 violation" in str(exc.value)


def test_sms_validation_accepts_generic_message():
    # Transactional messages without PHI are accepted
    msg = "Medi Waypoint: You have a new notification regarding appointment APPT-1234. Sign in to view."
    validate_sms_body_non_clinical(msg)
    assert send_sms("+8801712345678", msg) is True


@pytest.mark.django_db
def test_notification_list_and_read(client, user):
    client.force_authenticate(user=user)
    notif = Notification.objects.create(
        recipient=user,
        type="referral.status_update",
        title="Referral Update",
        body="Your referral has been acknowledged.",
        state="PENDING",
    )

    resp = client.get("/api/v1/notifications/")
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) == 1
    assert results[0]["id"] == str(notif.public_id)
    assert results[0]["state"] == "PENDING"

    # Mark as read
    read_resp = client.post(f"/api/v1/notifications/{notif.public_id}/read")
    assert read_resp.status_code == 200
    assert read_resp.json()["state"] == "READ"

    notif.refresh_from_db()
    assert notif.state == "READ"
    assert notif.read_at is not None
