"""Flashcard editing, against a throwaway in-memory SQLite database holding only the tables it touches
(never the dev Postgres)."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers relationship string refs (the name `app` is rebound below)
from app.core.database import Base, get_db
from app.main import app
from app.models import Flashcard, FlashcardReview, Module, Submodule

NOW = datetime(2026, 1, 1, tzinfo=UTC).replace(tzinfo=None)  # explicit, since the models' server_default "now()" is Postgres-only
DUE = datetime(2026, 1, 9, tzinfo=UTC).replace(tzinfo=None)


@pytest.fixture
def db() -> Iterator[Session]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    tables = [Module.__table__, Submodule.__table__, Flashcard.__table__, FlashcardReview.__table__]
    Base.metadata.create_all(engine, tables=tables)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def make_card(db: Session) -> Flashcard:
    module = Module(name="Algorithms", created_at=NOW)
    first = Submodule(module=module, title="Sorting", created_at=NOW, updated_at=NOW)
    card = Flashcard(
        module=module,
        submodule=first,
        front="Quicksort average?",
        back="O(n log n)",
        ease_factor=2.36,
        interval_days=6,
        repetitions=2,
        due_at=DUE,
        last_reviewed_at=NOW,
    )
    card.reviews.append(FlashcardReview(quality=4, reviewed_at=NOW))
    db.add(card)
    db.commit()
    return card


def test_editing_text_keeps_scheduling_and_review_history(client, db):
    card = make_card(db)

    response = client.patch(f"/flashcards/{card.id}", json={"front": "Quicksort average case?", "back": "Θ(n log n)"})

    assert response.status_code == 200
    body = response.json()
    assert (body["front"], body["back"]) == ("Quicksort average case?", "Θ(n log n)")
    assert (body["ease_factor"], body["interval_days"], body["repetitions"]) == (2.36, 6, 2)
    assert body["due_at"] == DUE.isoformat()
    db.refresh(card)
    assert len(card.reviews) == 1


def test_moves_a_card_to_another_submodule_of_its_module_or_the_whole_module(client, db):
    card = make_card(db)
    other = Submodule(module_id=card.module_id, title="Graphs", created_at=NOW, updated_at=NOW)
    db.add(other)
    db.commit()

    assert client.patch(f"/flashcards/{card.id}", json={"submodule_id": other.id}).json()["submodule_id"] == other.id
    assert client.patch(f"/flashcards/{card.id}", json={"submodule_id": None}).json()["submodule_id"] is None


def test_rejects_a_submodule_from_another_module(client, db):
    card = make_card(db)
    elsewhere = Submodule(module=Module(name="Networks", created_at=NOW), title="TCP", created_at=NOW, updated_at=NOW)
    db.add(elsewhere)
    db.commit()

    response = client.patch(f"/flashcards/{card.id}", json={"submodule_id": elsewhere.id})

    assert response.status_code == 400


def test_rejects_blank_text(client, db):
    card = make_card(db)

    assert client.patch(f"/flashcards/{card.id}", json={"front": "   "}).status_code == 422
    assert client.patch(f"/flashcards/{card.id}", json={"back": None}).status_code == 422


def test_missing_card_is_404(client):
    assert client.patch("/flashcards/999", json={"front": "x"}).status_code == 404


def test_reviews_are_newest_first_and_capped(client, db):
    card = make_card(db)  # one review at NOW
    for day in range(1, 25):
        card.reviews.append(FlashcardReview(quality=day % 6, reviewed_at=NOW + timedelta(days=day)))
    db.commit()

    reviews = client.get(f"/flashcards/{card.id}/reviews").json()

    assert len(reviews) == 20
    assert reviews[0]["reviewed_at"] == (NOW + timedelta(days=24)).isoformat()
    assert [r["reviewed_at"] for r in reviews] == sorted((r["reviewed_at"] for r in reviews), reverse=True)


def test_reviews_of_a_missing_card_is_404(client):
    assert client.get("/flashcards/999/reviews").status_code == 404


def test_due_can_be_limited_to_cards_without_a_topic(client, db):
    card = make_card(db)  # on a topic
    db.add(Flashcard(module_id=card.module_id, front="Loose", back="card", due_at=NOW))
    db.add(Flashcard(module_id=card.module_id, submodule_id=card.submodule_id, front="Topic", back="card", due_at=NOW))
    db.commit()

    due = client.get("/flashcards/due", params={"module_id": card.module_id, "no_submodule": "true"}).json()

    assert [c["front"] for c in due] == ["Loose"]
