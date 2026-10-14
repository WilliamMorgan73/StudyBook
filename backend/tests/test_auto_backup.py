"""Automatic backups, against a throwaway in-memory database and tmp folders: one is written when due, old
automatic ones are pruned while other backups are kept, failures are reported, and saved backups can be
listed and restored."""

import os
import zipfile
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers every table (the name `app` is rebound below)
from app.core.config import settings
from app.core.database import Base, create_sqlite_engine, get_db
from app.crud.app_settings import get_or_create_settings
from app.main import app
from app.models import Module
from app.services import auto_backup
from app.services.auto_backup import backup_if_due

NOW = datetime(2026, 10, 14, 9, 0, tzinfo=UTC)


@pytest.fixture
def folders(tmp_path, monkeypatch) -> tuple[Path, Path]:
    uploads, backups = tmp_path / "uploads", tmp_path / "backups"
    uploads.mkdir()
    monkeypatch.setattr(settings, "upload_dir", str(uploads))
    monkeypatch.setattr(settings, "backup_dir", str(backups))
    monkeypatch.setattr(auto_backup, "last_error", None)
    return uploads, backups


@pytest.fixture
def db(folders) -> Iterator[Session]:
    engine = create_sqlite_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False)()
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


def run(db: Session, folders: tuple[Path, Path], now: datetime = NOW) -> Path | None:
    uploads, backups = folders
    return backup_if_due(db, backup_dir=backups, upload_dir=uploads, now=now)


def fake_backup(folder: Path, name: str, written: datetime) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / name
    path.write_bytes(b"zip")
    os.utime(path, (written.timestamp(), written.timestamp()))
    return path


def test_on_by_default_daily_keeping_seven(db):
    row = get_or_create_settings(db)
    assert (row.auto_backup_enabled, row.auto_backup_interval_days, row.auto_backup_keep) == (True, 1, 7)


def test_writes_a_backup_when_there_is_none(db, folders):
    out = run(db, folders)

    assert out is not None and out.parent == folders[1] and out.name.startswith("auto-")
    with zipfile.ZipFile(out) as archive:
        assert "manifest.json" in archive.namelist()
    assert not list(folders[1].glob("*.partial"))


def test_skips_until_the_interval_has_passed(db, folders):
    fake_backup(folders[1], "auto-20261013-120000.zip", NOW - timedelta(hours=21))
    assert run(db, folders) is None

    get_or_create_settings(db).auto_backup_interval_days = 7
    assert run(db, folders, NOW + timedelta(days=3)) is None
    assert run(db, folders, NOW + timedelta(days=7)) is not None


def test_does_nothing_when_turned_off(db, folders):
    get_or_create_settings(db).auto_backup_enabled = False

    assert run(db, folders) is None
    assert not folders[1].exists()


def test_prunes_only_automatic_backups_to_the_newest_n(db, folders):
    backups = folders[1]
    get_or_create_settings(db).auto_backup_keep = 2
    for day in (10, 11, 12):
        fake_backup(backups, f"auto-202610{day}-090000.zip", NOW - timedelta(days=14 - day))
    others = [
        fake_backup(backups, "pre-restore-20260101-000000-000000.zip", NOW - timedelta(days=300)),
        fake_backup(backups, "pre-upgrade-abc.zip", NOW - timedelta(days=300)),
        fake_backup(backups, "my-own.zip", NOW - timedelta(days=300)),
    ]

    out = run(db, folders)

    assert sorted(path.name for path in auto_backup.automatic_backups(backups)) == ["auto-20261012-090000.zip", out.name]
    assert all(path.exists() for path in others)


def test_a_failure_is_kept_and_cleared_by_the_next_success(db, folders, monkeypatch):
    real_write = auto_backup.write_backup

    def broken(db, out_path, **kwargs):
        out_path.write_bytes(b"half a zip")
        raise OSError("No space left on device")

    monkeypatch.setattr(auto_backup, "write_backup", broken)
    assert run(db, folders) is None
    assert auto_backup.last_error.message == "No space left on device"
    assert not list(folders[1].iterdir())  # no partial left behind

    monkeypatch.setattr(auto_backup, "write_backup", real_write)
    assert run(db, folders) is not None
    assert auto_backup.last_error is None


def test_a_leftover_partial_is_deleted(db, folders):
    partial = fake_backup(folders[1], "auto-20261001-090000.zip.partial", NOW - timedelta(days=13))

    run(db, folders)

    assert not partial.exists()


def test_saved_lists_backups_newest_first_with_status(client, db, folders, monkeypatch):
    fake_backup(folders[1], "pre-upgrade-abc.zip", NOW - timedelta(days=5))
    out = run(db, folders)
    monkeypatch.setattr(auto_backup, "last_error", auto_backup.AutoBackupFailure(at=NOW, message="Disk full"))

    body = client.get("/backup/saved").json()

    assert body["folder"] == str(folders[1].resolve())
    assert [(b["name"], b["kind"]) for b in body["backups"]] == [(out.name, "automatic"), ("pre-upgrade-abc.zip", "pre-upgrade")]
    assert body["last_automatic_at"] == body["backups"][0]["created_at"]
    assert body["last_error"] == {"at": "2026-10-14T09:00:00", "message": "Disk full"}


def test_saved_is_empty_before_the_folder_exists(client):
    body = client.get("/backup/saved").json()
    assert (body["backups"], body["last_automatic_at"], body["last_error"]) == ([], None, None)


def test_restore_saved_replaces_data_and_keeps_a_pre_restore_copy(client, db, folders):
    get_or_create_settings(db)
    db.add(Module(id=1, name="Algebra", created_at=NOW.replace(tzinfo=None)))
    db.commit()
    saved = run(db, folders)
    db.add(Module(id=2, name="Added later", created_at=NOW.replace(tzinfo=None)))
    db.commit()

    response = client.post(f"/backup/saved/{saved.name}/restore")

    assert response.status_code == 200, response.text
    assert response.json()["counts"]["modules"] == 1
    assert Path(response.json()["pre_restore_backup"]).parent == folders[1].resolve()
    db.expire_all()
    assert [m.name for m in db.query(Module).all()] == ["Algebra"]


@pytest.mark.parametrize("name", ["missing.zip", "..%2Fsecret.zip", "notes.txt"])
def test_restore_saved_only_takes_a_zip_in_the_backup_folder(client, folders, name):
    (folders[1].parent / "secret.zip").write_bytes(b"zip")
    assert client.post(f"/backup/saved/{name}/restore").status_code == 404


def test_settings_accept_and_validate_auto_backup_fields(client):
    body = client.patch("/settings", json={"auto_backup_interval_days": 7, "auto_backup_keep": 3}).json()
    assert (body["auto_backup_enabled"], body["auto_backup_interval_days"], body["auto_backup_keep"]) == (True, 7, 3)

    assert client.patch("/settings", json={"auto_backup_keep": 0}).status_code == 422
    assert client.patch("/settings", json={"auto_backup_enabled": None}).json()["auto_backup_enabled"] is True
