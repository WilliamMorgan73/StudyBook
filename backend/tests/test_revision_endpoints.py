"""Revision plan and session endpoints, against a throwaway in-memory SQLite database holding only the
tables they touch (never the dev Postgres)."""

from collections.abc import Iterator
from datetime import UTC, datetime, time, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import ARRAY, create_engine, select
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers relationship string refs (the name `app` is rebound below)
from app.core.database import Base, get_db
from app.main import app
from app.models import (
    Assignment,
    Flashcard,
    FlashcardReview,
    Lecture,
    Module,
    PersonalEvent,
    RevisionSession,
    Submodule,
)
from app.models.assignment import assignment_submodules
from app.models.enums import AssignmentKind
from app.models.revision_session import revision_session_submodules


@compiles(ARRAY, "sqlite")
def _array_as_json(_type, _compiler, **_kw) -> str:
    # SQLite has no arrays; only `personal_events.weekdays` uses one, and these tests never write it.
    return "JSON"


# A Monday at least a week out, so "now" never cuts into the plan; the exam is the next Monday at 09:00,
# leaving exactly seven study days.
_today = datetime.now(UTC).astimezone().date()
START = _today + timedelta(days=7 + (7 - _today.weekday()) % 7)
EXAM_AT = datetime.combine(START + timedelta(days=7), time(9))
EVERY_DAY = list(range(7))


@pytest.fixture
def db() -> Iterator[Session]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    tables = [
        Module.__table__,
        Submodule.__table__,
        Assignment.__table__,
        assignment_submodules,
        Lecture.__table__,
        Flashcard.__table__,
        FlashcardReview.__table__,
        PersonalEvent.__table__,
        RevisionSession.__table__,
        revision_session_submodules,
    ]
    Base.metadata.create_all(engine, tables=tables)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


NOW = datetime(2026, 1, 1, tzinfo=UTC).replace(tzinfo=None)  # explicit, since the models' server_default "now()" is Postgres-only


def make_module(db: Session, n_submodules: int = 3) -> tuple[Module, list[Submodule]]:
    module = Module(name="Algorithms", created_at=NOW)
    submodules = [
        Submodule(module=module, title=f"Topic {i}", created_at=NOW, updated_at=NOW) for i in range(1, n_submodules + 1)
    ]
    db.add(module)
    db.commit()
    return module, submodules


def make_exam(db: Session, module: Module, covered: list[Submodule], *, due_at=EXAM_AT, title="Final") -> Assignment:
    exam = Assignment(
        module=module,
        title=title,
        due_at=due_at,
        weight_percent=50,
        kind=AssignmentKind.exam,
        duration_minutes=120,
        covered_submodules=covered,
    )
    db.add(exam)
    db.commit()
    return exam


def plan_body(**overrides) -> dict:
    return {"start_date": START.isoformat(), "weekdays": EVERY_DAY, "session_minutes": 60} | overrides


def test_create_plan_saves_one_session_per_study_day_covering_every_topic(client, db):
    module, subs = make_module(db)
    exam = make_exam(db, module, subs)

    response = client.post(f"/assignments/{exam.id}/revision-plan", json=plan_body())

    assert response.status_code == 201
    sessions = response.json()
    assert len(sessions) == 7
    assert {s["starts_at"][:10] for s in sessions} == {(START + timedelta(days=d)).isoformat() for d in range(7)}
    assert {sub["id"] for s in sessions for sub in s["submodules"]} == {s.id for s in subs}
    assert all(s["done"] is False and s["guidance_markdown"] is None for s in sessions)
    assert all(s["module_id"] == module.id and s["exam_title"] == "Final" for s in sessions)
    assert db.scalar(select(RevisionSession).where(RevisionSession.assignment_id == exam.id)) is not None


def test_plan_avoids_lectures_and_other_exams_sessions(client, db):
    module, subs = make_module(db)
    exam = make_exam(db, module, subs)
    other = make_exam(db, module, subs, title="Midterm", due_at=EXAM_AT + timedelta(days=30))
    db.add(Lecture(module=module, title="Lecture", scheduled_at=datetime.combine(START, time(9)), duration_minutes=90))
    db.add(RevisionSession(assignment=other, starts_at=datetime.combine(START, time(10, 30)), duration_minutes=60))
    db.commit()

    sessions = client.post(f"/assignments/{exam.id}/revision-plan", json=plan_body()).json()

    # 09:00-10:30 lecture, 10:30-11:30 the other exam's session: the first free hour starts at 11:30.
    assert sessions[0]["starts_at"] == datetime.combine(START, time(11, 30)).isoformat()


def test_not_enough_time_is_a_readable_422_and_saves_nothing(client, db):
    module, subs = make_module(db, n_submodules=5)
    exam = make_exam(db, module, subs)

    response = client.post(
        f"/assignments/{exam.id}/revision-plan", json=plan_body(weekdays=[0], session_minutes=30)
    )

    assert response.status_code == 422
    assert "isn't enough" in response.json()["detail"]
    assert db.scalars(select(RevisionSession)).all() == []


@pytest.mark.parametrize(
    ("body", "fragment"),
    [
        (plan_body(weekdays=[]), "weekday"),
        (plan_body(weekdays=[7]), "Weekdays"),
        (plan_body(start_date=(START + timedelta(days=30)).isoformat()), "start date"),
    ],
)
def test_invalid_plan_requests_are_rejected(client, db, body, fragment):
    module, subs = make_module(db)
    exam = make_exam(db, module, subs)

    response = client.post(f"/assignments/{exam.id}/revision-plan", json=body)

    assert response.status_code == 422
    assert fragment in response.json()["detail"]


def test_only_exams_with_covered_submodules_and_no_plan_can_be_planned(client, db):
    module, subs = make_module(db)
    coursework = Assignment(module=module, title="Essay", due_at=EXAM_AT, weight_percent=10)
    db.add(coursework)
    db.commit()
    uncovered = make_exam(db, module, [], title="Quiz")

    assert client.post(f"/assignments/{coursework.id}/revision-plan", json=plan_body()).status_code == 400
    assert client.post(f"/assignments/{uncovered.id}/revision-plan", json=plan_body()).status_code == 400

    exam = make_exam(db, module, subs)
    assert client.post(f"/assignments/{exam.id}/revision-plan", json=plan_body()).status_code == 201
    assert client.post(f"/assignments/{exam.id}/revision-plan", json=plan_body()).status_code == 409


def test_list_sessions_filters_by_exam_module_and_date_range(client, db):
    module, subs = make_module(db)
    exam = make_exam(db, module, subs)
    other_module, other_subs = make_module(db)
    other_exam = make_exam(db, other_module, other_subs, due_at=EXAM_AT + timedelta(days=7))
    client.post(f"/assignments/{exam.id}/revision-plan", json=plan_body())
    client.post(f"/assignments/{other_exam.id}/revision-plan", json=plan_body())

    by_exam = client.get("/revision-sessions", params={"assignment_id": exam.id}).json()
    by_module = client.get("/revision-sessions", params={"module_id": other_module.id}).json()
    first_day = client.get(
        "/revision-sessions",
        params={"start": datetime.combine(START, time.min).isoformat(), "end": datetime.combine(START, time.max).isoformat()},
    ).json()

    assert len(by_exam) == 7 and {s["assignment_id"] for s in by_exam} == {exam.id}
    assert len(by_module) == 14 and {s["module_id"] for s in by_module} == {other_module.id}
    # Each exam treats the other's sessions as busy, so both fit on the first day without overlapping.
    assert len(first_day) == 2
    a, b = sorted(first_day, key=lambda s: s["starts_at"])
    assert a["ends_at"] <= b["starts_at"]


def test_done_tick_persists_and_shows_on_the_calendar(client, db):
    module, subs = make_module(db)
    exam = make_exam(db, module, subs)
    session_id = client.post(f"/assignments/{exam.id}/revision-plan", json=plan_body()).json()[0]["id"]

    assert client.patch(f"/revision-sessions/{session_id}", json={"done": True}).json()["done"] is True
    assert client.get(f"/revision-sessions/{session_id}").json()["done"] is True

    calendar = client.get(
        "/calendar",
        params={"start": datetime.combine(START, time.min).isoformat(), "end": EXAM_AT.isoformat()},
    ).json()
    revision = [e for e in calendar if e["kind"] == "revision"]
    assert len(revision) == 7
    ticked = next(e for e in revision if e["id"] == session_id)
    assert ticked["done"] is True
    assert ticked["module_id"] == module.id
    assert ticked["url"] == f"/modules/{module.id}/assignments/{exam.id}?session={session_id}"


def test_session_view_lists_topics_with_weakness_and_weakest_cards(client, db):
    module, subs = make_module(db, n_submodules=1)
    topic = subs[0]
    exam = make_exam(db, module, subs)
    shaky = Flashcard(module=module, submodule=topic, front="Shaky", back="A", due_at=NOW)
    solid = Flashcard(module=module, submodule=topic, front="Solid", back="B", due_at=NOW)
    unseen = Flashcard(module=module, submodule=topic, front="Unseen", back="C", due_at=NOW)
    for n, quality in enumerate([1, 0, 4]):
        db.add(FlashcardReview(flashcard=shaky, quality=quality, reviewed_at=NOW + timedelta(days=n)))
    db.add(FlashcardReview(flashcard=solid, quality=5, reviewed_at=NOW))
    db.add(unseen)
    db.commit()
    session_id = client.post(f"/assignments/{exam.id}/revision-plan", json=plan_body()).json()[0]["id"]

    view = client.get(f"/revision-sessions/{session_id}").json()

    assert [t["title"] for t in view["topics"]] == [topic.title]
    assert 0 < view["topics"][0]["weakness"] < 1
    assert [c["front"] for c in view["weakest_cards"]] == ["Shaky", "Solid"]
    assert view["weakest_cards"][0]["lapse_rate"] == pytest.approx(2 / 3)
    assert view["guidance_markdown"] is None


def test_unknown_session_is_404(client):
    assert client.get("/revision-sessions/999").status_code == 404
    assert client.patch("/revision-sessions/999", json={"done": True}).status_code == 404


def test_delete_plan_removes_its_sessions_so_it_can_be_replanned(client, db):
    module, subs = make_module(db)
    exam = make_exam(db, module, subs)
    client.post(f"/assignments/{exam.id}/revision-plan", json=plan_body())

    assert client.delete(f"/assignments/{exam.id}/revision-plan").status_code == 204
    assert client.get("/revision-sessions", params={"assignment_id": exam.id}).json() == []
    assert client.post(f"/assignments/{exam.id}/revision-plan", json=plan_body()).status_code == 201
