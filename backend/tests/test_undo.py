"""Undo for deletes (#118), against a throwaway in-memory SQLite database and tmp folders: every delete
can be undone exactly (rows, ids, links, SET NULL columns and attachment files), once, within the undo's
lifetime, and an undo that no longer fits is refused without changing anything."""

import os
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# The backup tests' "one row in every table" seed, so undo is checked against every kind of link.
from test_backup import seed, snapshot

import app.models  # registers every table (the name `app` is rebound below)
from app.core.config import settings
from app.core.database import Base, create_sqlite_engine, get_db
from app.main import app
from app.models import Flashcard, ModuleLink
from app.services import undo as undo_service

FILE = "submodules/3/abc.png"


@pytest.fixture
def upload_dir(tmp_path, monkeypatch) -> Path:
    folder = tmp_path / "uploads"
    folder.mkdir()
    monkeypatch.setattr(settings, "upload_dir", str(folder))
    return folder


@pytest.fixture
def undo_dir() -> Path:
    return Path(settings.undo_dir)  # a tmp folder, from conftest


@pytest.fixture
def db(upload_dir) -> Iterator[Session]:
    engine = create_sqlite_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    seed(session, upload_dir)
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def delete(client: TestClient, path: str) -> str:
    response = client.delete(path)
    assert response.status_code == 200, response.text
    return response.json()["undo_token"]


@pytest.mark.parametrize(
    "path",
    ["/modules/7", "/submodules/3", "/assignments/4", "/flashcards/11", "/lectures/5", "/attachments/21"],
)
def test_undo_puts_back_exactly_what_the_delete_removed(client, db, upload_dir, undo_dir, path):
    before = snapshot(db)
    token = delete(client, path)
    db.expire_all()
    assert snapshot(db) != before

    assert client.post(f"/undo/{token}").status_code == 204
    db.expire_all()
    assert snapshot(db) == before
    assert (upload_dir / FILE).read_bytes() == b"png bytes"
    assert not (undo_dir / token).exists()


def test_deleting_a_topic_unlinks_its_cards_and_undo_relinks_them(client, db):
    token = delete(client, "/submodules/3")
    db.expire_all()
    assert db.get(Flashcard, 11).submodule_id is None
    client.post(f"/undo/{token}")
    db.expire_all()
    assert db.get(Flashcard, 11).submodule_id == 3


def test_undoing_a_module_brings_back_its_links_both_ways(client, db):
    token = delete(client, "/modules/7")
    links = select(ModuleLink.module_id, ModuleLink.related_module_id)
    assert db.execute(links).all() == []
    client.post(f"/undo/{token}")
    assert sorted(db.execute(links).all()) == [(7, 9), (9, 7)]


def test_a_deleted_attachment_file_waits_in_the_undo_folder(client, upload_dir, undo_dir):
    token = delete(client, "/attachments/21")
    assert not (upload_dir / FILE).exists()
    assert (undo_dir / token / "files" / FILE).read_bytes() == b"png bytes"


def test_an_undo_works_once(client):
    token = delete(client, "/flashcards/11")
    assert client.post(f"/undo/{token}").status_code == 204
    assert client.post(f"/undo/{token}").status_code == 404


def test_an_expired_undo_is_gone_and_purged(client, undo_dir):
    token = delete(client, "/attachments/21")
    old = time.time() - undo_service.UNDO_TTL_SECONDS - 5
    os.utime(undo_dir / token, (old, old))
    assert client.post(f"/undo/{token}").status_code == 404
    assert not (undo_dir / token).exists()


def test_the_next_delete_purges_expired_undos(client, undo_dir):
    token = delete(client, "/attachments/21")
    old = time.time() - undo_service.UNDO_TTL_SECONDS - 5
    os.utime(undo_dir / token, (old, old))
    delete(client, "/flashcards/11")
    assert not (undo_dir / token).exists()


def test_an_undo_that_no_longer_fits_changes_nothing(client, db, upload_dir, undo_dir):
    # The card goes, then its whole module: the card has nothing to go back into.
    card_token = delete(client, "/flashcards/11")
    delete(client, "/modules/7")
    db.expire_all()
    before = snapshot(db)

    response = client.post(f"/undo/{card_token}")
    assert response.status_code == 409
    db.expire_all()
    assert snapshot(db) == before
    assert (undo_dir / card_token).exists()  # still there, until it expires


def test_undoing_in_reverse_order_restores_both(client, db):
    before = snapshot(db)
    card_token = delete(client, "/flashcards/11")
    module_token = delete(client, "/modules/7")
    assert client.post(f"/undo/{module_token}").status_code == 204
    assert client.post(f"/undo/{card_token}").status_code == 204
    db.expire_all()
    assert snapshot(db) == before


@pytest.mark.parametrize("token", ["nope", "..", "a" * 32])
def test_unknown_tokens_are_not_found(client, token):
    assert client.post(f"/undo/{token}").status_code == 404


def test_a_failed_delete_leaves_no_undo_folder(client, db, undo_dir, monkeypatch):
    def fail() -> None:
        raise RuntimeError("disk full")

    monkeypatch.setattr(db, "commit", fail)
    with pytest.raises(RuntimeError):
        client.delete("/flashcards/11")
    assert list(undo_dir.iterdir()) == []


def test_undo_keeps_sql_nulls_in_json_columns(client, db):
    # Plain None in a JSON column would come back as the text 'null'.
    token = delete(client, "/modules/7")
    client.post(f"/undo/{token}")
    assert db.execute(text("SELECT dashboard_layout IS NULL FROM modules WHERE id = 7")).scalar() == 1
