"""Assignment list endpoint, against a throwaway in-memory SQLite database holding only the tables it
touches (never the dev Postgres)."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers relationship string refs (the name `app` is rebound below)
from app.core.clock import local_now
from app.core.database import Base, get_db
from app.main import app
from app.models import Assignment, AssignmentTodo, Attachment, Module, Submodule
from app.models.assignment import assignment_submodules
from app.models.enums import AssignmentStatus

NOW = datetime(2026, 1, 1, tzinfo=UTC).replace(tzinfo=None)  # explicit, since the models' server_default "now()" is Postgres-only


@pytest.fixture
def db() -> Iterator[Session]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    tables = [
        Module.__table__,
        Submodule.__table__,
        Assignment.__table__,
        assignment_submodules,
        AssignmentTodo.__table__,
        Attachment.__table__,
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


def test_upcoming_leaves_out_submitted_and_graded_assignments(client, db):
    module = Module(name="Algorithms", created_at=NOW)
    past_due = local_now() - timedelta(days=2)
    for status in AssignmentStatus:
        db.add(Assignment(module=module, title=status.value, due_at=past_due, weight_percent=10, status=status))
    db.commit()

    response = client.get("/assignments", params={"upcoming": "true"})

    assert response.status_code == 200
    assert sorted(a["title"] for a in response.json()) == ["in_progress", "not_started"]
