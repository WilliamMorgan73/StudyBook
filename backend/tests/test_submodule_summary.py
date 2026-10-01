"""AI Submodule summaries: the staleness hash as a pure function of the material, what the summary
request sends (through the FakeAIClient), and the read-time stale check. Prompt wording isn't tested."""

import pytest

import app.models  # noqa: F401  registers relationship string refs
from app.models.attachment import Attachment
from app.models.enums import AttachmentKind
from app.models.submodule import Submodule
from app.services.ai import AIError, FakeAIClient
from app.services.submodule_source import SourceAttachment, SubmoduleSource
from app.services.submodule_summary import (
    SYSTEM_PROMPT,
    source_hash,
    summarize,
    summary_is_stale,
)

SLIDES_TEXT = "Dijkstra's algorithm relaxes edges in order of distance using a priority queue. " * 3
NOTE = "Shortest paths need non-negative weights."


def source(*attachments: SourceAttachment, note: str = NOTE, title: str = "Graphs") -> SubmoduleSource:
    return SubmoduleSource(submodule_id=1, title=title, note_markdown=note, attachments=attachments)


def slides(**overrides) -> SourceAttachment:
    fields = {
        "attachment_id": 1,
        "filename": "slides.pdf",
        "kind": AttachmentKind.pdf,
        "file_path": "uploads/slides.pdf",
        "markdown": SLIDES_TEXT,
        "near_empty": False,
        "send_raw_pdf": False,
    }
    return SourceAttachment(**(fields | overrides))


# --- source_hash -------------------------------------------------------------------------------


def test_hash_is_deterministic_and_hex():
    digest = source_hash(source(slides()))
    assert digest == source_hash(source(slides()))
    assert len(digest) == 64 and int(digest, 16) >= 0


def test_hash_changes_with_the_note_or_attachment_text():
    base = source_hash(source(slides()))
    assert source_hash(source(slides(), note=NOTE + " Edited.")) != base
    assert source_hash(source(slides(markdown="Different slides."))) != base
    assert source_hash(source()) != base
    assert source_hash(source(slides(), slides(attachment_id=2, filename="more.pdf"))) != base


def test_hash_ignores_surrounding_whitespace_title_and_raw_pdf_opt_in():
    base = source_hash(source(slides(near_empty=True)))
    assert source_hash(source(slides(near_empty=True), note=f"\n{NOTE}  \n")) == base
    assert source_hash(source(slides(near_empty=True), title="Renamed")) == base
    assert source_hash(source(slides(near_empty=True, send_raw_pdf=True))) == base


def test_failed_extraction_hashes_as_unreadable_whatever_the_error():
    failed = slides(markdown="", error="corrupt file")
    assert source_hash(source(failed)) == source_hash(source(slides(markdown="", error="not converted yet")))
    # An unreadable file is distinct from a readable but empty one, and from no file at all.
    assert source_hash(source(failed)) != source_hash(source(slides(markdown="")))
    assert source_hash(source(failed)) != source_hash(source())


# --- summarize ---------------------------------------------------------------------------------


def test_request_sends_note_and_attachment_text_as_free_text():
    fake = FakeAIClient(text_replies=["  ## Graphs\n\nSummary.  \n"])

    summary = summarize(fake, source(slides()))

    assert summary == "## Graphs\n\nSummary."
    [request] = fake.requests
    assert request["kind"] == "complete"
    assert request["system"] == SYSTEM_PROMPT
    assert NOTE in request["prompt"]
    assert SLIDES_TEXT.strip() in request["prompt"]
    assert request["documents"] == []


def test_opted_in_raw_pdf_is_sent_as_a_document_instead_of_its_text():
    fake = FakeAIClient(text_replies=["Summary."])
    scan = slides(filename="scan.pdf", file_path="uploads/scan.pdf", markdown="p. 1", near_empty=True, send_raw_pdf=True)

    summarize(fake, source(scan), read_pdf=lambda path: b"%PDF " + path.encode())

    [doc] = fake.requests[0]["documents"]
    assert doc.title == "scan.pdf" and doc.data == b"%PDF uploads/scan.pdf"
    assert "scan.pdf" in fake.requests[0]["prompt"]
    assert "p. 1" not in fake.requests[0]["prompt"]


def test_empty_reply_is_an_ai_error():
    with pytest.raises(AIError) as exc:
        summarize(FakeAIClient(text_replies=["  \n"]), source())
    assert exc.value.kind == "unknown"


# --- summary_is_stale --------------------------------------------------------------------------


def submodule(*attachments: Attachment, note: str = NOTE) -> Submodule:
    return Submodule(id=1, module_id=1, title="Graphs", content_markdown=note, attachments=list(attachments))


def cached_pdf(id: int, text: str | None) -> Attachment:
    return Attachment(id=id, submodule_id=1, kind=AttachmentKind.pdf, filename=f"f{id}.pdf",
                      file_path=f"x/f{id}.pdf", extracted_markdown=text)


def summarised(row: Submodule) -> Submodule:
    """Store a summary hashed from the row's current (cached) material."""
    row.summary_markdown = "Summary."
    row.summary_source_hash = source_hash(
        source(*[slides(attachment_id=a.id, filename=a.filename, markdown=a.extracted_markdown or "",
                        error=None if a.extracted_markdown is not None else "x") for a in row.attachments],
               note=row.content_markdown)
    )
    return row


def test_no_summary_is_never_stale():
    assert summary_is_stale(submodule()) is False


def test_unchanged_material_is_not_stale():
    assert summary_is_stale(summarised(submodule(cached_pdf(1, SLIDES_TEXT)))) is False


def test_note_edit_makes_it_stale():
    row = summarised(submodule(cached_pdf(1, SLIDES_TEXT)))
    row.content_markdown += "\nMore."
    assert summary_is_stale(row) is True


def test_new_unconverted_upload_makes_it_stale_without_converting():
    row = summarised(submodule(cached_pdf(1, SLIDES_TEXT)))
    row.attachments.append(cached_pdf(2, None))

    assert summary_is_stale(row) is True
    assert row.attachments[1].extracted_markdown is None  # nothing was converted


def test_attachment_that_failed_at_generation_and_still_has_no_text_is_not_stale():
    assert summary_is_stale(summarised(submodule(cached_pdf(1, None)))) is False


def test_media_attachments_are_ignored():
    row = summarised(submodule())
    row.attachments.append(Attachment(id=3, submodule_id=1, kind=AttachmentKind.video, filename="talk.mp4",
                                      file_path="x/talk.mp4"))
    assert summary_is_stale(row) is False
