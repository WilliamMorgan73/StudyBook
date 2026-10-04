"""First-run setup flag and the default module layout on the settings endpoint, against a throwaway
in-memory SQLite database (never the dev database)."""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers relationship string refs (the name `app` is rebound below)
from app.core.database import create_sqlite_engine, get_db
from app.main import app
from app.models.app_settings import AppSettings
from app.models.module import Module

NOW = datetime(2026, 1, 1, tzinfo=UTC).replace(tzinfo=None)
LAYOUT = [
    {"i": "flashcards", "x": 0, "y": 0, "w": 6, "h": 14},
    {"i": "submodules", "x": 6, "y": 0, "w": 6, "h": 14},
]


@pytest.fixture
def db() -> Iterator[Session]:
    engine = create_sqlite_engine("sqlite://", poolclass=StaticPool)
    AppSettings.__table__.create(engine)
    Module.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_a_fresh_install_needs_setup(client: TestClient) -> None:
    assert client.get("/settings").json()["setup_completed"] is False


def test_an_install_with_modules_but_no_settings_row_is_already_set_up(client: TestClient, db: Session) -> None:
    db.add(Module(name="Algorithms", created_at=NOW))
    db.commit()

    assert client.get("/settings").json()["setup_completed"] is True


def test_finishing_setup_sticks_and_null_leaves_it(client: TestClient) -> None:
    assert client.patch("/settings", json={"setup_completed": True}).json()["setup_completed"] is True
    assert client.patch("/settings", json={"setup_completed": None}).json()["setup_completed"] is True


def test_default_module_layout_round_trips_and_resets(client: TestClient) -> None:
    assert client.get("/settings").json()["default_module_layout"] is None
    assert client.patch("/settings", json={"default_module_layout": LAYOUT}).json()["default_module_layout"] == LAYOUT
    assert client.patch("/settings", json={"theme_mode": "dark"}).json()["default_module_layout"] == LAYOUT
    assert client.patch("/settings", json={"default_module_layout": None}).json()["default_module_layout"] is None


@pytest.mark.parametrize("model", ["settings", "quick_note"])
def test_losing_the_race_to_create_the_single_row_returns_the_winners(db: Session, monkeypatch, model) -> None:
    # A new install's first page load asks for these several times at once: each request sees no row, and
    # all but one fail to insert id=1. Simulated here: the row exists, but this request's first lookup missed it.
    from app.api.routes.quick_note import _get_or_create
    from app.crud.app_settings import get_or_create_settings
    from app.models.quick_note import QuickNote

    cls, get_or_create = (AppSettings, get_or_create_settings) if model == "settings" else (QuickNote, _get_or_create)
    cls.__table__.create(db.get_bind(), checkfirst=True)
    db.execute(cls.__table__.insert().values(id=1))
    db.commit()
    real_get, calls = Session.get, []

    def first_lookup_misses(self, entity, ident, **kw):
        calls.append(ident)
        return None if len(calls) == 1 else real_get(self, entity, ident, **kw)

    monkeypatch.setattr(Session, "get", first_lookup_misses)

    row = get_or_create(db)

    assert row is not None and row.id == 1
    assert db.query(cls).count() == 1
