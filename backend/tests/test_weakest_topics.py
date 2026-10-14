"""GET /submodules/weakest, against a throwaway in-memory SQLite database (never the dev database)."""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers relationship string refs (the name `app` is rebound below)
from app.core.database import Base, create_sqlite_engine, get_db
from app.main import app
from app.models import Flashcard, FlashcardReview, Module, Submodule

NOW = datetime(2026, 10, 14, 9, 0, tzinfo=UTC).replace(tzinfo=None)


@pytest.fixture
def db() -> Iterator[Session]:
    engine = create_sqlite_engine("sqlite://", poolclass=StaticPool)
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


def topic(module: Module, title: str, qualities: list[int], cards: int = 1) -> Submodule:
    """A topic with `cards` cards; the first gets one review per quality."""
    sub = Submodule(module=module, title=title, created_at=NOW, updated_at=NOW)
    for i in range(cards):
        card = Flashcard(module=module, submodule=sub, front=f"{title} {i}", back="…", due_at=NOW)
        if i == 0:
            card.reviews.extend(FlashcardReview(quality=q, reviewed_at=NOW) for q in qualities)
    return sub


@pytest.fixture
def seeded(db: Session) -> dict[str, Module]:
    algs = Module(name="Algorithms", created_at=NOW)
    nets = Module(name="Networks", created_at=NOW)
    db.add_all(
        [
            topic(algs, "Graphs", [1, 1, 2, 4], cards=3),  # mostly lapses
            topic(algs, "Sorting", [5, 5, 4, 5]),  # never lapses
            topic(nets, "Routing", []),  # cards but no reviews: neutral
            Submodule(module=nets, title="No cards", created_at=NOW, updated_at=NOW),
        ]
    )
    db.commit()
    return {"algs": algs, "nets": nets}


def test_lists_topics_with_cards_weakest_first(client, seeded):
    body = client.get("/submodules/weakest").json()

    assert [t["title"] for t in body] == ["Graphs", "Routing", "Sorting"]
    graphs, routing, sorting = body
    assert graphs["weakness"] > routing["weakness"] > sorting["weakness"]
    assert routing["weakness"] == pytest.approx(0.5)
    assert (graphs["module_name"], graphs["card_count"]) == ("Algorithms", 3)


def test_limits_and_filters_by_module(client, seeded):
    assert [t["title"] for t in client.get("/submodules/weakest", params={"limit": 1}).json()] == ["Graphs"]
    by_module = client.get("/submodules/weakest", params={"module_id": seeded["nets"].id}).json()
    assert [t["title"] for t in by_module] == ["Routing"]


def test_weakest_is_not_read_as_a_submodule_id(client, seeded):
    assert client.get("/submodules/weakest", params={"limit": 0}).status_code == 422
