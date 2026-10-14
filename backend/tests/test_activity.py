"""Study activity counts (GET /stats/activity), against a throwaway in-memory SQLite database."""

from collections.abc import Iterator
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers relationship string refs (the name `app` is rebound below)
from app.core.database import Base, create_sqlite_engine, get_db
from app.crud.stats import count_by_local_day
from app.main import app
from app.models import Flashcard, FlashcardReview, Module, Submodule


def utc(*args: int) -> datetime:
    """A naive UTC timestamp, as reviews are stored."""
    return datetime(*args, tzinfo=UTC).replace(tzinfo=None)


def test_buckets_by_local_date_across_a_time_zone_boundary():
    times = [utc(2026, 10, 13, 23, 30), utc(2026, 10, 14, 9), utc(2026, 10, 14, 22, 59)]
    # In London (BST, +1) 23:30 UTC on the 13th is 00:30 on the 14th, and 22:59 on the 14th is still the 14th.
    london = count_by_local_day(times, ZoneInfo("Europe/London"), date(2026, 10, 1), date(2026, 10, 31))
    assert london == {date(2026, 10, 14): 3}
    # In New York (EDT, -4) the first is still the 13th.
    new_york = count_by_local_day(times, ZoneInfo("America/New_York"), date(2026, 10, 1), date(2026, 10, 31))
    assert new_york == {date(2026, 10, 13): 1, date(2026, 10, 14): 2}
    # Outside the range is dropped.
    assert count_by_local_day(times, ZoneInfo("UTC"), date(2026, 10, 14), date(2026, 10, 14)) == {date(2026, 10, 14): 2}


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


def test_endpoint_counts_reviews_per_local_day(client, db):
    module = Module(name="Algorithms", created_at=utc(2026, 1, 1))
    card = Flashcard(module=module, front="Q", back="A", due_at=utc(2026, 1, 1))
    card.reviews.extend(
        FlashcardReview(quality=4, reviewed_at=t) for t in [utc(2026, 10, 13, 23, 30), utc(2026, 10, 14, 9), utc(2026, 9, 1)]
    )
    db.add(card)
    db.commit()

    params = {"start": "2026-10-01", "end": "2026-10-31", "tz": "Europe/London"}
    assert client.get("/stats/activity", params=params).json() == {"2026-10-14": 2}
    assert client.get("/stats/activity", params={**params, "module_id": module.id}).json() == {"2026-10-14": 2}
    assert client.get("/stats/activity", params={**params, "module_id": module.id + 1}).json() == {}


def test_endpoint_rejects_bad_ranges_and_zones(client):
    assert client.get("/stats/activity", params={"start": "2026-10-02", "end": "2026-10-01"}).status_code == 422
    assert client.get("/stats/activity", params={"start": "2020-01-01", "end": "2026-10-01"}).status_code == 422
    bad_zone = {"start": "2026-10-01", "end": "2026-10-02", "tz": "Mars/Olympus"}
    assert client.get("/stats/activity", params=bad_zone).status_code == 422
