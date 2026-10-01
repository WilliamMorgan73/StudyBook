"""Submodule AI endpoints wired end to end, against a throwaway in-memory SQLite database holding
only the tables they touch (never the dev Postgres), with the AI client faked."""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers relationship string refs (the name `app` is rebound below)
from app.api.deps import get_ai_client
from app.core.database import get_db
from app.main import app
from app.models.app_settings import AppSettings
from app.models.attachment import Attachment
from app.models.enums import AttachmentKind, FlashcardSource
from app.models.flashcard import Flashcard
from app.models.module import Module
from app.models.submodule import Submodule
from app.schemas.flashcard import FlashcardCreate
from app.services.ai import AIError, FakeAIClient
from app.services.ai_models import AI_PROVIDERS

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=UTC).replace(tzinfo=None)
SLIDES_TEXT = "Dijkstra's algorithm relaxes edges in order of distance using a priority queue. " * 3


@pytest.fixture
def db(monkeypatch) -> Iterator[Session]:
    # `updated_at`'s onupdate is the Postgres string "now()", which SQLite's DateTime rejects.
    monkeypatch.setattr(Submodule.__table__.c.updated_at, "onupdate", None)
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    for model in (AppSettings, Module, Submodule, Attachment, Flashcard):
        model.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    session.add(Module(id=1, name="Algorithms", created_at=NOW))
    session.add(Submodule(id=1, module_id=1, title="Graphs", content_markdown="Notes on graphs.", created_at=NOW, updated_at=NOW))
    session.add_all(
        [
            Attachment(id=1, submodule_id=1, kind=AttachmentKind.pdf, filename="slides.pdf", file_path="x/slides.pdf",
                       uploaded_at=NOW, extracted_markdown=SLIDES_TEXT),
            Attachment(id=2, submodule_id=1, kind=AttachmentKind.pdf, filename="scan.pdf", file_path="x/scan.pdf",
                       uploaded_at=NOW, extracted_markdown=""),
            Attachment(id=3, submodule_id=1, kind=AttachmentKind.video, filename="talk.mp4", file_path="x/talk.mp4",
                       uploaded_at=NOW),
        ]
    )
    session.add(Flashcard(module_id=1, submodule_id=1, front="What is a graph?", back="Vertices and edges.", due_at=NOW))
    session.commit()
    yield session
    session.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_estimate_lists_extractable_attachments_and_near_empty_pdfs(client):
    body = client.get("/submodules/1/ai-source").json()

    assert [a["filename"] for a in body["attachments"]] == ["slides.pdf", "scan.pdf"]
    slides, scan = body["attachments"]
    assert not slides["near_empty"] and slides["estimated_tokens"] > 0
    assert scan["near_empty"] and not scan["send_raw_pdf"] and scan["raw_pdf_estimated_tokens"] > 0
    assert body["estimated_tokens"] == body["note_estimated_tokens"] + slides["estimated_tokens"]
    assert body["large"] is False


def test_raw_pdf_estimate_follows_the_selected_provider(client):
    # scan.pdf isn't on disk, so it counts as one page.
    claude = client.get("/submodules/1/ai-source").json()["attachments"][1]
    client.patch("/settings", json={"ai_model": "gemini-3.8-flash"})
    gemini = client.get("/submodules/1/ai-source").json()["attachments"][1]

    assert claude["raw_pdf_estimated_tokens"] == AI_PROVIDERS["anthropic"].pdf_tokens_per_page
    assert gemini["raw_pdf_estimated_tokens"] == AI_PROVIDERS["gemini"].pdf_tokens_per_page


def test_estimate_with_raw_pdf_opt_in(client):
    body = client.get("/submodules/1/ai-source", params={"raw_pdf_ids": [2]}).json()

    assert body["attachments"][1]["send_raw_pdf"] is True
    assert client.get("/submodules/1/ai-source", params={"raw_pdf_ids": [1]}).status_code == 422


def test_generate_returns_cleaned_proposals_and_writes_nothing(client, db):
    fake = FakeAIClient(
        structured_replies=[{"cards": [{"front": "what is a graph?", "back": "dupe"}, {"front": "Q", "back": "A"}]}]
    )
    app.dependency_overrides[get_ai_client] = lambda: fake

    response = client.post("/submodules/1/flashcards/generate", json={"count": 5})

    assert response.status_code == 200
    assert response.json() == {"proposals": [{"front": "Q", "back": "A"}]}
    assert "What is a graph?" in fake.requests[0]["prompt"]
    assert SLIDES_TEXT.strip() in fake.requests[0]["prompt"]
    assert db.scalar(select(func.count()).select_from(Flashcard)) == 1


def test_generate_rejects_counts_over_the_cap(client):
    app.dependency_overrides[get_ai_client] = lambda: FakeAIClient()

    assert client.post("/submodules/1/flashcards/generate", json={"count": 31}).status_code == 422


def test_generate_without_a_key_is_not_configured(client):
    response = client.post("/submodules/1/flashcards/generate", json={})

    assert response.status_code == 409
    assert response.json()["kind"] == "not_configured"


def test_create_payload_carries_the_source():
    card = Flashcard(**FlashcardCreate(module_id=1, front="Q", back="A", source="ai").model_dump())
    assert card.source == FlashcardSource.ai
    assert FlashcardCreate(module_id=1, front="Q", back="A").source == FlashcardSource.manual


def test_read_payload_has_no_summary_and_is_not_stale_by_default(client):
    body = client.get("/submodules/1").json()

    assert body["summary_markdown"] is None
    assert body["summary_stale"] is False


def test_summarize_stores_summary_and_hash_then_stale_flag_follows_the_note(client, db):
    fake = FakeAIClient(text_replies=["## Graphs\n\nVertices and edges."])
    app.dependency_overrides[get_ai_client] = lambda: fake

    response = client.post("/submodules/1/summary", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["summary_markdown"] == "## Graphs\n\nVertices and edges."
    assert body["summary_stale"] is False
    assert "Notes on graphs." in fake.requests[0]["prompt"]
    assert SLIDES_TEXT.strip() in fake.requests[0]["prompt"]
    assert len(db.get(Submodule, 1).summary_source_hash) == 64

    assert client.get("/submodules/1").json()["summary_stale"] is False
    patched = client.patch("/submodules/1", json={"content_markdown": "Notes on graphs, edited."}).json()
    assert patched["summary_stale"] is True
    assert patched["summary_markdown"] == "## Graphs\n\nVertices and edges."  # never regenerated automatically
    assert client.get("/submodules/1").json()["summary_stale"] is True


def test_summarize_with_raw_pdf_sends_the_document_and_rejects_other_ids(client, monkeypatch):
    monkeypatch.setattr("app.services.submodule_summary.Path.read_bytes", lambda self: b"%PDF raw")
    fake = FakeAIClient(text_replies=["Summary."])
    app.dependency_overrides[get_ai_client] = lambda: fake

    assert client.post("/submodules/1/summary", json={"raw_pdf_ids": [1]}).status_code == 422
    response = client.post("/submodules/1/summary", json={"raw_pdf_ids": [2]})

    assert response.status_code == 200
    [doc] = fake.requests[0]["documents"]
    assert doc.title == "scan.pdf" and doc.data == b"%PDF raw"
    # The raw-PDF opt-in doesn't change the material's hash, so the summary isn't stale.
    assert response.json()["summary_stale"] is False


def test_failed_summary_keeps_the_previous_one(client, db):
    db.get(Submodule, 1).summary_markdown = "Old summary."
    db.commit()
    app.dependency_overrides[get_ai_client] = lambda: FakeAIClient(text_replies=[AIError("rate_limit", "Slow down.")])

    response = client.post("/submodules/1/summary", json={})

    assert response.status_code == 429
    assert response.json() == {"detail": "Slow down.", "kind": "rate_limit"}
    assert db.get(Submodule, 1).summary_markdown == "Old summary."


def test_summarize_without_a_key_is_not_configured(client):
    response = client.post("/submodules/1/summary", json={})

    assert response.status_code == 409
    assert response.json()["kind"] == "not_configured"
