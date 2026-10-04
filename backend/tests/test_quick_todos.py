"""Quick to-dos, General and module-scoped, against a throwaway in-memory SQLite database (never
the dev Postgres)."""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers relationship string refs (the name `app` is rebound below)
from app.core.database import get_db
from app.main import app
from app.models.module import Module
from app.models.quick_todo import QuickTodo

NOW = datetime(2026, 1, 1, tzinfo=UTC).replace(tzinfo=None)  # the models' server_default "now()" is Postgres-only


@pytest.fixture
def db() -> Iterator[Session]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    # SQLite only enforces foreign keys (and so ON DELETE CASCADE) when asked.
    event.listen(engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
    Module.__table__.create(engine)
    QuickTodo.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def module_id(db: Session) -> int:
    module = Module(name="Algorithms", created_at=NOW)
    db.add(module)
    db.commit()
    return module.id


def add_todo(db: Session, text: str, module_id: int | None = None) -> None:
    db.add(QuickTodo(text=text, module_id=module_id, created_at=NOW))
    db.commit()


def test_general_todos_have_no_module(client: TestClient, db: Session) -> None:
    add_todo(db, "Buy milk")
    assert client.get("/quick-todos").json()[0]["module_id"] is None


def test_create_for_unknown_module_is_404(client: TestClient) -> None:
    assert client.post("/quick-todos", json={"text": "x", "module_id": 999}).status_code == 404


def test_list_filters_by_module(client: TestClient, db: Session, module_id: int) -> None:
    add_todo(db, "General")
    add_todo(db, "Revise trees", module_id)

    assert [t["text"] for t in client.get("/quick-todos").json()] == ["General", "Revise trees"]
    assert [t["text"] for t in client.get("/quick-todos", params={"module_id": module_id}).json()] == ["Revise trees"]


def test_deleting_module_deletes_its_todos(db: Session, module_id: int) -> None:
    add_todo(db, "General")
    add_todo(db, "Revise trees", module_id)
    db.execute(Module.__table__.delete().where(Module.id == module_id))
    db.commit()

    assert [t.text for t in db.query(QuickTodo).all()] == ["General"]
