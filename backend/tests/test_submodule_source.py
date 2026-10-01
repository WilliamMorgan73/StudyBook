"""Gathering a Submodule's source material for AI features, on unsaved model instances with the
extraction and page counting stubbed (no files, no DB)."""

import pytest

import app.models  # noqa: F401  registers relationship string refs before we touch the mapper
from app.crud.attachment_text import AttachmentExtractionFailedError, ExtractedText
from app.models.attachment import Attachment
from app.models.enums import AttachmentKind
from app.models.submodule import Submodule
from app.services.submodule_source import (
    LARGE_REQUEST_TOKENS,
    PDF_TOKENS_PER_PAGE,
    RawPdfNotAllowedError,
    estimate_tokens,
    gather_submodule_source,
)

SLIDES_TEXT = "Dijkstra's algorithm relaxes edges in order of distance using a priority queue."


def attachment(id: int, filename: str, kind: AttachmentKind) -> Attachment:
    return Attachment(id=id, submodule_id=1, kind=kind, filename=filename, file_path=f"uploads/{filename}")


def submodule(note: str, *attachments: Attachment) -> Submodule:
    return Submodule(id=1, module_id=1, title="Graphs", content_markdown=note, attachments=list(attachments))


def fake_extract(texts: dict[int, ExtractedText | Exception]):
    def extract(a: Attachment) -> ExtractedText:
        result = texts[a.id]
        if isinstance(result, Exception):
            raise result
        return result

    return extract


def gather(sub: Submodule, texts: dict, raw_pdf_ids=(), pages: int | None = 3):
    return gather_submodule_source(sub, raw_pdf_ids=raw_pdf_ids, extract=fake_extract(texts), count_pages=lambda _: pages)


def test_note_and_extracted_attachment_text_are_included_and_media_skipped():
    sub = submodule(
        "# Shortest paths",
        attachment(1, "slides.pptx", AttachmentKind.pptx),
        attachment(2, "lecture.mp4", AttachmentKind.video),
    )

    source = gather(sub, {1: ExtractedText(SLIDES_TEXT, near_empty=False)})

    assert [a.attachment_id for a in source.attachments] == [1]
    text = source.text_markdown()
    assert "# Shortest paths" in text
    assert SLIDES_TEXT in text
    assert 'filename="slides.pptx"' in text
    assert source.documents(read=lambda _: b"") == []


def test_estimate_adds_note_and_attachment_text():
    note = "x" * 400
    sub = submodule(note, attachment(1, "slides.pdf", AttachmentKind.pdf))

    source = gather(sub, {1: ExtractedText(SLIDES_TEXT, near_empty=False)})

    assert source.note_estimated_tokens == 100
    assert source.estimated_tokens == 100 + estimate_tokens(SLIDES_TEXT)
    assert not source.large


def test_large_material_is_flagged():
    source = gather(submodule("y" * (LARGE_REQUEST_TOKENS * 4 + 4)), {})

    assert source.large


def test_near_empty_pdf_is_reported_but_not_sent_raw_without_opting_in():
    sub = submodule("notes", attachment(1, "scan.pdf", AttachmentKind.pdf))

    source = gather(sub, {1: ExtractedText("p. 1", near_empty=True)}, pages=4)

    [scan] = source.near_empty_attachments
    assert scan.raw_pdf_estimated_tokens == 4 * PDF_TOKENS_PER_PAGE
    assert not scan.send_raw_pdf
    assert source.raw_pdfs == []
    assert "p. 1" in source.text_markdown()  # the thin text is still what gets sent
    assert source.estimated_tokens == source.note_estimated_tokens + estimate_tokens("p. 1")


def test_opted_in_raw_pdf_replaces_its_text_and_counts_pages():
    sub = submodule("notes", attachment(1, "scan.pdf", AttachmentKind.pdf))

    source = gather(sub, {1: ExtractedText("p. 1", near_empty=True)}, raw_pdf_ids=[1], pages=2)

    assert [a.attachment_id for a in source.raw_pdfs] == [1]
    assert "p. 1" not in source.text_markdown()
    assert source.estimated_tokens == source.note_estimated_tokens + 2 * PDF_TOKENS_PER_PAGE
    [doc] = source.documents(read=lambda path: f"bytes of {path}".encode())
    assert doc.title == "scan.pdf"
    assert doc.data == b"bytes of uploads/scan.pdf"


@pytest.mark.parametrize("raw_id", [1, 99])
def test_raw_pdf_only_allowed_for_this_submodules_near_empty_pdfs(raw_id):
    sub = submodule("notes", attachment(1, "slides.pdf", AttachmentKind.pdf))

    with pytest.raises(RawPdfNotAllowedError):
        gather(sub, {1: ExtractedText(SLIDES_TEXT, near_empty=False)}, raw_pdf_ids=[raw_id])


def test_failed_extraction_is_reported_and_left_out():
    sub = submodule("notes", attachment(1, "broken.pdf", AttachmentKind.pdf))

    source = gather(sub, {1: AttachmentExtractionFailedError("corrupt file")})

    [broken] = source.attachments
    assert broken.error == "corrupt file"
    assert broken.estimated_tokens == 0
    assert "broken.pdf" not in source.text_markdown()


def test_is_empty_without_note_or_usable_attachments():
    assert gather(submodule("  \n"), {}).is_empty
    assert gather(submodule("", attachment(1, "broken.pdf", AttachmentKind.pdf)), {1: AttachmentExtractionFailedError("x")}).is_empty
    scan = attachment(1, "scan.pdf", AttachmentKind.pdf)
    assert not gather(submodule("", scan), {1: ExtractedText("", near_empty=True)}, raw_pdf_ids=[1]).is_empty
