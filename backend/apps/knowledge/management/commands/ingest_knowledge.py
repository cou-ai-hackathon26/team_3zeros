from django.core.files import File
from django.core.management.base import BaseCommand, CommandError

from apps.common.exceptions import ValidationError
from apps.knowledge.ingest import ingest_document, store_upload


class Command(BaseCommand):
    help = (
        "Load a PDF into the medical knowledge base and embed it. For very large books or a first load; the platform admin "
        "page does the same through the browser. It is NOT searchable until approved (page, or --approve with --reviewer)."
    )

    def add_arguments(self, parser):
        parser.add_argument("pdf")
        parser.add_argument("--title", required=True)
        parser.add_argument("--publisher", default="")
        parser.add_argument("--doc-version", default="")
        parser.add_argument("--language", default="en")
        parser.add_argument("--rights", default="", help="Rights statement for the book")
        parser.add_argument("--approve", action="store_true", help="Approve right away (needs --reviewer: the named clinical reviewer)")
        parser.add_argument("--reviewer", default="")

    def handle(self, *args, pdf, title, publisher, doc_version, language, rights, approve, reviewer, **opts):
        if approve and not reviewer:
            raise CommandError("--approve needs --reviewer: the clinical reviewer who approved this source.")
        try:
            with open(pdf, "rb") as f:
                doc = store_upload(File(f), title=title, publisher=publisher, version=doc_version, language=language, rights_statement=rights, queue=False)  # this command runs the ingestion itself
        except (OSError, ValidationError) as exc:
            raise CommandError(str(exc))
        self.stdout.write(f"Stored {doc.title}; embedding passages (resumable, this can take a while)...")
        doc = ingest_document(doc)
        self.stdout.write(f"{doc.status}: {doc.page_count} pages, {doc.chunk_count} passages, {doc.embedded_count} embedded.")
        if doc.status == "FAILED":
            raise CommandError(doc.error)
        if approve:
            from django.utils import timezone
            doc.approved, doc.reviewer_name, doc.approved_at = True, reviewer, timezone.now()
            doc.save(update_fields=["approved", "reviewer_name", "approved_at"])
            self.stdout.write("Approved: now searchable.")
