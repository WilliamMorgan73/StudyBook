"""AI flashcard generation through the FakeAIClient: what goes into the request, and how replies
are cleaned and validated. Prompt wording is deliberately not tested."""

import pytest

from app.models.enums import AttachmentKind
from app.services.ai import AIError, FakeAIClient
from app.services.flashcard_generation import (
    MAX_CARD_COUNT,
    CardProposal,
    CardProposals,
    generate_flashcards,
)
from app.services.submodule_source import SourceAttachment, SubmoduleSource

SLIDES_TEXT = "Dijkstra's algorithm relaxes edges in order of distance using a priority queue."


def source(*attachments: SourceAttachment, note: str = "Shortest paths need non-negative weights.") -> SubmoduleSource:
    return SubmoduleSource(submodule_id=1, title="Graphs", note_markdown=note, attachments=attachments)


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


def cards(*pairs: tuple[str, str]) -> dict:
    return {"cards": [{"front": f, "back": b} for f, b in pairs]}


def test_request_includes_note_attachment_text_existing_fronts_and_count():
    fake = FakeAIClient(structured_replies=[cards(("Q", "A"))])

    generate_flashcards(fake, source(slides()), ["What is a graph?"], count=7)

    [request] = fake.requests
    assert request["schema"] is CardProposals
    assert "Shortest paths need non-negative weights." in request["prompt"]
    assert SLIDES_TEXT in request["prompt"]
    assert "What is a graph?" in request["prompt"]
    assert "7" in request["prompt"]
    assert request["documents"] == []


def test_opted_in_raw_pdf_is_sent_as_a_document():
    fake = FakeAIClient(structured_replies=[cards(("Q", "A"))])
    scan = slides(filename="scan.pdf", file_path="uploads/scan.pdf", markdown="", near_empty=True, send_raw_pdf=True)

    generate_flashcards(fake, source(scan), [], read_pdf=lambda path: b"%PDF " + path.encode())

    [doc] = fake.requests[0]["documents"]
    assert doc.title == "scan.pdf"
    assert doc.data == b"%PDF uploads/scan.pdf"


def test_over_count_reply_is_cut_to_the_requested_count():
    fake = FakeAIClient(structured_replies=[cards(*[(f"Q{i}", f"A{i}") for i in range(12)])])

    proposals = generate_flashcards(fake, source(), [], count=5)

    assert [p.front for p in proposals] == ["Q0", "Q1", "Q2", "Q3", "Q4"]


def test_duplicates_and_blank_cards_are_dropped_and_whitespace_trimmed():
    fake = FakeAIClient(
        structured_replies=[
            cards(
                ("  what is   a GRAPH? ", "dupe of an existing card"),
                ("Define relaxation.", "  Lowering a tentative distance.  "),
                ("define relaxation.", "dupe within the reply"),
                ("   ", "blank front"),
                ("Blank back", ""),
            )
        ]
    )

    proposals = generate_flashcards(fake, source(), ["What is a graph?"], count=10)

    assert proposals == [CardProposal(front="Define relaxation.", back="Lowering a tentative distance.")]


@pytest.mark.parametrize("reply", [{"cards": [{"front": "Q"}]}, {"proposals": []}, {"cards": "nope"}])
def test_malformed_reply_is_a_readable_ai_error(reply):
    fake = FakeAIClient(structured_replies=[reply])

    with pytest.raises(AIError) as excinfo:
        generate_flashcards(fake, source(), [])

    assert excinfo.value.kind == "unknown"


@pytest.mark.parametrize("count", [0, MAX_CARD_COUNT + 1])
def test_count_outside_the_cap_is_rejected_before_any_request(count):
    fake = FakeAIClient()

    with pytest.raises(ValueError):
        generate_flashcards(fake, source(), [], count=count)

    assert fake.requests == []
