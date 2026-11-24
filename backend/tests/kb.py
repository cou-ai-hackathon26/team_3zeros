"""Test helper: a ready, embedded reference document (embeddings come from the offline mock provider)."""
from apps.ai.embeddings import embed_texts
from apps.knowledge.ingest import _fill_search_vectors
from apps.knowledge.models import KnowledgeChunk, KnowledgeDocument

DEFAULT_TEXT = "Fever with severe headache and stiff neck needs urgent assessment by a doctor."


def make_doc(title="Fever Guide", approved=True, page=12, text=DEFAULT_TEXT, status="READY", texts=None, **extra):
    doc = KnowledgeDocument.objects.create(title=title, approved=approved, status=status, **extra)
    for i, t in enumerate(texts or [text]):
        KnowledgeChunk.objects.create(document=doc, page=page + i, ordinal=0, text=t, embedding=embed_texts([t])[0])
    doc.chunk_count = doc.embedded_count = doc.chunks.count()
    doc.save(update_fields=["chunk_count", "embedded_count"])
    _fill_search_vectors(doc)
    return doc


def make_pdf(pages):
    """A small valid text PDF, one string per page ("" gives a blank, scanned-looking page)."""
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", None, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for text in pages:
        content_num, page_num = len(objs) + 2, len(objs) + 1
        kids.append(f"{page_num} 0 R")
        safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream = f"BT /F1 12 Tf 40 700 Td ({safe}) Tj ET" if text else ""
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {content_num} 0 R /Resources << /Font << /F1 3 0 R >> >> >>")
        objs.append(f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream")
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(pages)} >>"
    out, offsets = b"%PDF-1.4\n", []
    for n, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{n} 0 obj\n{body}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out
