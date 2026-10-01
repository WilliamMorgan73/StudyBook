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
from app.services.ai import FakeAIClient

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=UTC).replace(tzinfo=None)
SLIDES_TEXT = "Dijkstra's algorithm relaxes edges in order of distance using a priority queue. " * 3


@pytest.fixture
def db() -> Iterator[Session]:
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
