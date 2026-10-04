"""Overview dashboard layout on the settings endpoint, against a throwaway in-memory SQLite
database holding only the app_settings table (never the dev database)."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers relationship string refs (the name `app` is rebound below)
from app.core.database import create_sqlite_engine, get_db
from app.main import app
from app.models.app_settings import AppSettings
from app.models.module import Module

LAYOUT = [
    {"i": "calendar", "x": 0, "y": 0, "w": 8, "h": 14},
    {"i": "modules", "x": 8, "y": 0, "w": 4, "h": 20},
]


@pytest.fixture
def db() -> Iterator[Session]:
    engine = create_sqlite_engine("sqlite://", poolclass=StaticPool)
    AppSettings.__table__.create(engine)
    Module.__table__.create(engine)  # read by the first-run check when the settings row is created
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_layout_defaults_to_null(client: TestClient) -> None:
    assert client.get("/settings").json()["dashboard_layout"] is None


def test_layout_round_trips(client: TestClient) -> None:
    response = client.patch("/settings", json={"dashboard_layout": LAYOUT})
    assert response.status_code == 200
    assert response.json()["dashboard_layout"] == LAYOUT
    assert client.get("/settings").json()["dashboard_layout"] == LAYOUT


def test_other_updates_leave_layout_alone(client: TestClient) -> None:
    client.patch("/settings", json={"dashboard_layout": LAYOUT})
    client.patch("/settings", json={"theme_mode": "dark"})
    assert client.get("/settings").json()["dashboard_layout"] == LAYOUT


def test_null_resets_layout(client: TestClient) -> None:
    client.patch("/settings", json={"dashboard_layout": LAYOUT})
    response = client.patch("/settings", json={"dashboard_layout": None})
    assert response.json()["dashboard_layout"] is None


@pytest.mark.parametrize(
    "item",
    [
        {"i": "calendar", "x": -1, "y": 0, "w": 4, "h": 4},
        {"i": "calendar", "x": 0, "y": 0, "w": 0, "h": 4},
        {"i": "calendar", "x": 6, "y": 0, "w": 8, "h": 4},
        {"i": "", "x": 0, "y": 0, "w": 4, "h": 4},
    ],
)
def test_rejects_invalid_items(client: TestClient, item: dict) -> None:
    assert client.patch("/settings", json={"dashboard_layout": [item]}).status_code == 422


def test_rejects_too_many_items(client: TestClient) -> None:
    layout = [{"i": f"w{n}", "x": 0, "y": n, "w": 1, "h": 1} for n in range(33)]
    assert client.patch("/settings", json={"dashboard_layout": layout}).status_code == 422
