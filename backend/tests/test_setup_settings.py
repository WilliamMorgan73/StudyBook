"""First-run setup flag and the default module layout on the settings endpoint, against a throwaway
in-memory SQLite database (never the dev Postgres)."""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers relationship string refs (the name `app` is rebound below)
from app.core.database import get_db
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
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
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
