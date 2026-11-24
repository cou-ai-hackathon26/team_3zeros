"""Knowledge-base administration API (D-29): platform admin only, audited, approval needs a named reviewer."""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts.models import Membership, PlatformAdmin, User
from apps.audit.models import AuditEvent
from apps.knowledge.models import KnowledgeDocument
from apps.organizations.models import Facility
from tests.kb import make_doc, make_pdf

B = "/api/v1/admin/knowledge"


@pytest.fixture(autouse=True)
def _media(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)


def _client(user=None):
    c = APIClient()
    if user:
        c.force_authenticate(user)
    return c


@pytest.fixture
def platform_admin(db):
    u = User.objects.create_user(email="pa@example.com", password="x")
    PlatformAdmin.objects.create(user=u)
    return u


def _upload(c, pages=("Cough with blood needs imaging.",), **extra):
    f = SimpleUploadedFile("b.pdf", make_pdf(list(pages)), content_type="application/pdf")
    return c.post(f"{B}/documents", {"file": f, "title": "Book", "language": "en", **extra}, format="multipart")


@pytest.mark.django_db
def test_only_a_platform_admin_can_use_it():
    fac = Facility.objects.create(name="F")
    fac_admin = User.objects.create_user(email="fa@example.com", password="x")
    Membership.objects.create(user=fac_admin, facility=fac, role="facility_admin")
    clinician = User.objects.create_user(email="c@example.com", password="x")
    Membership.objects.create(user=clinician, facility=fac, role="clinician")
    doc = make_doc(approved=False)
    for who in (fac_admin, clinician):
        c = _client(who)
        assert c.get(f"{B}/documents").status_code == 403
        assert _upload(c).status_code == 403
        assert c.post(f"{B}/documents/{doc.public_id}/approve", {"reviewer_name": "x", "rights_confirmed": True}, format="json").status_code == 403
        assert c.get(f"{B}/search?q=fever").status_code == 403
    assert _client().get(f"{B}/documents").status_code in (401, 403)


@pytest.mark.django_db
def test_upload_lists_and_shows_progress(platform_admin):
    c = _client(platform_admin)
    r = _upload(c, publisher="Pub", version="1")
    assert r.status_code == 201 and r.data["title"] == "Book" and r.data["approved"] is False
    assert r.data["status"] in ("PROCESSING", "READY")  # eager workers may have finished already
    listing = c.get(f"{B}/documents").data["results"]
    assert len(listing) == 1 and listing[0]["id"] == r.data["id"]
    detail = c.get(f"{B}/documents/{r.data['id']}").data
    assert {"page_count", "chunk_count", "embedded_count", "status"} <= set(detail)


@pytest.mark.django_db
def test_bad_uploads_are_rejected(platform_admin):
    c = _client(platform_admin)
    bad = c.post(f"{B}/documents", {"file": SimpleUploadedFile("x.pdf", b"nope"), "title": "x"}, format="multipart")
    assert bad.status_code == 400
    assert _upload(c).status_code == 201
    assert _upload(c).status_code == 400  # same file again


@pytest.mark.django_db
def test_approval_needs_a_ready_document_a_reviewer_and_the_rights_box(platform_admin):
    c = _client(platform_admin)
    processing = make_doc("P", approved=False, status="PROCESSING")
    ready = make_doc("R", approved=False)
    ok = {"reviewer_name": "Dr Rahman", "rights_confirmed": True}
    assert c.post(f"{B}/documents/{processing.public_id}/approve", ok, format="json").status_code == 400
    assert c.post(f"{B}/documents/{ready.public_id}/approve", {"reviewer_name": "Dr Rahman", "rights_confirmed": False}, format="json").status_code == 400
    assert c.post(f"{B}/documents/{ready.public_id}/approve", {"reviewer_name": "", "rights_confirmed": True}, format="json").status_code == 400
    r = c.post(f"{B}/documents/{ready.public_id}/approve", ok, format="json")
    assert r.status_code == 200 and r.data["approved"] is True and r.data["reviewer_name"] == "Dr Rahman" and r.data["approved_at"]
    ready.refresh_from_db()
    assert ready.approved_by == platform_admin


@pytest.mark.django_db
def test_an_approved_book_is_searched_and_retiring_removes_it(platform_admin):
    from apps.knowledge.search import search
    c = _client(platform_admin)
    d = make_doc(approved=False, text="Dengue fever shows a falling platelet count.")
    assert search("platelet count dengue") == []
    c.post(f"{B}/documents/{d.public_id}/approve", {"reviewer_name": "Dr R", "rights_confirmed": True}, format="json")
    assert search("platelet count dengue")
    r = c.post(f"{B}/documents/{d.public_id}/retire")
    assert r.status_code == 200 and r.data["approved"] is False and r.data["retired_at"]
    assert search("platelet count dengue") == []


@pytest.mark.django_db
def test_retry_only_for_failed_and_delete_only_while_not_approved(platform_admin):
    c = _client(platform_admin)
    failed = make_doc("F", approved=False, status="FAILED")
    ready = make_doc("R", approved=True)
    assert c.post(f"{B}/documents/{ready.public_id}/retry").status_code == 400
    assert c.post(f"{B}/documents/{failed.public_id}/retry").status_code == 202
    assert c.delete(f"{B}/documents/{ready.public_id}").status_code == 400  # approved: retire first
    assert KnowledgeDocument.objects.filter(pk=ready.pk).exists()
    assert c.delete(f"{B}/documents/{failed.public_id}").status_code == 204
    assert not KnowledgeDocument.objects.filter(pk=failed.pk).exists()


@pytest.mark.django_db
def test_test_search_works_on_an_unapproved_book_and_hides_internal_ids(platform_admin):
    c = _client(platform_admin)
    d = make_doc(approved=False, text="Cough with blood needs chest imaging.")
    r = c.get(f"{B}/search?q=cough with blood&document={d.public_id}")
    assert r.status_code == 200 and r.data["results"] and "id" not in r.data["results"][0]
    assert c.get(f"{B}/search").status_code == 400


@pytest.mark.django_db
def test_every_change_is_audited(platform_admin):
    c = _client(platform_admin)
    r = _upload(c)
    d = KnowledgeDocument.objects.get(public_id=r.data["id"])
    d.status = "READY"; d.save()
    c.post(f"{B}/documents/{d.public_id}/approve", {"reviewer_name": "Dr R", "rights_confirmed": True}, format="json")
    c.post(f"{B}/documents/{d.public_id}/retire")
    reasons = list(AuditEvent.objects.filter(object_type="knowledge_document", object_id=str(d.public_id)).values_list("reason", flat=True))
    assert "uploaded" in reasons and any("approved; clinical reviewer: Dr R" in x for x in reasons) and "retired" in reasons
