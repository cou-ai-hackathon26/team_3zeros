from django.core.management.base import BaseCommand, CommandError
from pypdf import PdfReader

from apps.knowledge.models import KnowledgeChunk, KnowledgeDocument
from apps.knowledge.search import chunk_text


class Command(BaseCommand):
    help = "Load a PDF into the medical knowledge base. Add --approve only after a clinician has approved the source."

    def add_arguments(self, parser):
        parser.add_argument("pdf")
        parser.add_argument("--title", required=True)
        parser.add_argument("--publisher", default="")
        parser.add_argument("--doc-version", default="")
        parser.add_argument("--approve", action="store_true")

    def handle(self, *args, pdf, title, publisher, doc_version, approve, **opts):
        try:
            reader = PdfReader(pdf)
        except Exception as exc:
            raise CommandError(f"Cannot read PDF: {exc}")
        doc = KnowledgeDocument.objects.create(title=title, publisher=publisher, version=doc_version, approved=approve)
        total = 0
        for number, page in enumerate(reader.pages, start=1):
            for piece in chunk_text(page.extract_text() or ""):
                KnowledgeChunk.objects.create(document=doc, page=number, text=piece)
                total += 1
        self.stdout.write(f"Loaded {total} passages from {len(reader.pages)} pages. approved={approve}")
        if total == 0:
            self.stdout.write("Warning: no text found (scanned PDF?). OCR it first.")
