"""Module page layout on the module endpoints, against a throwaway in-memory SQLite database
(never the dev Postgres)."""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import ARRAY, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers relationship string refs (the name `app` is rebound below)
from app.core.database import Base, get_db
from app.main import app
from app.models.module import Module

LAYOUT = [
    {"i": "schedule", "x": 0, "y": 0, "w": 12, "h": 5},
    {"i": "submodules", "x": 0, "y": 5, "w": 6, "h": 9},
]


@pytest.fixture
def db() -> Iterator[Session]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    # SQLite can't create the Postgres-only ARRAY columns, and the module page reads none of them.
    tables = [
        t for t in Base.metadata.sorted_tables if not any(isinstance(c.type, ARRAY) for c in t.columns)
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


def add_module(db: Session, name: str) -> int:
    # created_at given explicitly, since the model's server_default "now()" is Postgres-only.
    module = Module(name=name, created_at=datetime(2026, 1, 1, tzinfo=UTC).replace(tzinfo=None))
    db.add(module)
    db.commit()
    return module.id


@pytest.fixture
def module_id(db: Session) -> int:
    return add_module(db, "Algorithms")


def test_layout_defaults_to_null(client: TestClient, module_id: int) -> None:
    assert client.get(f"/modules/{module_id}").json()["dashboard_layout"] is None


def test_layout_round_trips(client: TestClient, module_id: int) -> None:
    assert client.patch(f"/modules/{module_id}", json={"dashboard_layout": LAYOUT}).status_code == 200
    assert client.get(f"/modules/{module_id}").json()["dashboard_layout"] == LAYOUT


def test_layout_is_per_module(client: TestClient, db: Session, module_id: int) -> None:
    other = add_module(db, "Databases")
    client.patch(f"/modules/{module_id}", json={"dashboard_layout": LAYOUT})
    assert client.get(f"/modules/{other}").json()["dashboard_layout"] is None


def test_other_updates_leave_layout_alone(client: TestClient, module_id: int) -> None:
    client.patch(f"/modules/{module_id}", json={"dashboard_layout": LAYOUT})
    client.patch(f"/modules/{module_id}", json={"name": "Advanced Algorithms"})
    assert client.get(f"/modules/{module_id}").json()["dashboard_layout"] == LAYOUT


def test_null_resets_layout(client: TestClient, module_id: int) -> None:
    client.patch(f"/modules/{module_id}", json={"dashboard_layout": LAYOUT})
    client.patch(f"/modules/{module_id}", json={"dashboard_layout": None})
    assert client.get(f"/modules/{module_id}").json()["dashboard_layout"] is None


def test_rejects_overflowing_item(client: TestClient, module_id: int) -> None:
    layout = [{"i": "schedule", "x": 6, "y": 0, "w": 8, "h": 4}]
    assert client.patch(f"/modules/{module_id}", json={"dashboard_layout": layout}).status_code == 422


BANNER = {"stats": ["nextExam", "grade"], "ring": False, "tint": "strong", "size": "compact"}


def test_notes_and_banner_default_to_null(client: TestClient, module_id: int) -> None:
    body = client.get(f"/modules/{module_id}").json()
    assert body["notes"] is None
    assert body["banner"] is None


def test_notes_and_banner_round_trip(client: TestClient, module_id: int) -> None:
    response = client.patch(f"/modules/{module_id}", json={"notes": "Read chapter 4", "banner": BANNER})
    assert response.status_code == 200
    body = client.get(f"/modules/{module_id}").json()
    assert body["notes"] == "Read chapter 4"
    assert body["banner"] == BANNER


def test_null_resets_banner(client: TestClient, module_id: int) -> None:
    client.patch(f"/modules/{module_id}", json={"banner": BANNER})
    client.patch(f"/modules/{module_id}", json={"banner": None})
    assert client.get(f"/modules/{module_id}").json()["banner"] is None


@pytest.mark.parametrize(
    "banner",
    [
        {**BANNER, "tint": "neon"},
        {**BANNER, "size": "huge"},
        {**BANNER, "stats": [""]},
        {**BANNER, "stats": [f"s{n}" for n in range(7)]},
    ],
)
def test_rejects_invalid_banner(client: TestClient, module_id: int, banner: dict) -> None:
    assert client.patch(f"/modules/{module_id}", json={"banner": banner}).status_code == 422
