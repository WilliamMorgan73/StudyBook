"""The production app (`app.desktop`): API under /api, uploads, and the built frontend with client-side
routes falling back to index.html, all from one origin. Uses a tmp frontend build and upload folder."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.desktop import create_app


@pytest.fixture
def client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>StudyBook</title>")
    (dist / "assets" / "app.js").write_text("console.log('hi')")
    uploads = tmp_path / "uploads"
    (uploads / "submodules" / "1").mkdir(parents=True)
    (uploads / "submodules" / "1" / "x.png").write_bytes(b"png")
    monkeypatch.setattr(settings, "upload_dir", str(uploads))
    yield TestClient(create_app(dist))  # not `with`: the lifespan would set up the real database


def test_serves_the_api_under_api(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/no-such-route").status_code == 404  # an API 404, not the frontend


def test_serves_uploads(client):
    assert client.get("/uploads/submodules/1/x.png").content == b"png"
    assert client.get("/uploads/submodules/1/missing.png").status_code == 404


def test_serves_the_frontend_and_falls_back_to_index_for_client_routes(client):
    assert "StudyBook" in client.get("/").text
    assert client.get("/assets/app.js").text == "console.log('hi')"
    deep_link = client.get("/modules/3/submodules/7")
    assert deep_link.status_code == 200 and "StudyBook" in deep_link.text


def test_refuses_to_start_without_a_built_frontend(tmp_path):
    with pytest.raises(SystemExit, match="No built frontend"):
        create_app(tmp_path / "missing")
