"""Backup and restore, against a throwaway in-memory SQLite database and a tmp upload folder (never the dev
Postgres): a backup round-trips every table and file exactly, keeps ids, never carries the AI keys, and a
backup that can't be restored is rejected before anything is touched."""

import io
import json
import zipfile
from collections.abc import Iterator
from datetime import UTC, date, datetime, time
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers every table (the name `app` is rebound below)
from app.core.config import settings
from app.core.database import Base, create_sqlite_engine, get_db
from app.main import app
from app.models import (
    AppSettings,
    Assignment,
    AssignmentTodo,
    Attachment,
    CalendarFeed,
    CalendarFeedEvent,
    CalendarFeedLink,
    Flashcard,
    FlashcardReview,
    Lecture,
    Module,
    ModuleLink,
    PersonalEvent,
    QuickNote,
    QuickTodo,
    RevisionSession,
    Submodule,
)
from app.models.enums import (
    AssignmentKind,
    AssignmentStatus,
    AttachmentKind,
    FlashcardSource,
)
from app.services import backup as backup_service
from app.services.backup import BackupError, read_backup, restore_backup, write_backup


def naive(*parts: int) -> datetime:
    return datetime(*parts, tzinfo=UTC).replace(tzinfo=None)


T0 = naive(2026, 10, 1, 9, 30)


@pytest.fixture
def upload_dir(tmp_path, monkeypatch) -> Path:
    folder = tmp_path / "uploads"
    folder.mkdir()
    monkeypatch.setattr(settings, "upload_dir", str(folder))
    monkeypatch.setattr(settings, "backup_dir", str(tmp_path / "backups"))
    return folder


@pytest.fixture
def db(monkeypatch, upload_dir) -> Iterator[Session]:
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


def seed(db: Session, upload_dir: Path) -> None:
    """One row in every table (the server `now()` defaults don't work on SQLite, so timestamps are explicit)."""
    db.add(
        AppSettings(
            id=1,
            setup_completed=True,
            anthropic_api_key="sk-ant-secret",
            dashboard_layout=[{"i": "calendar", "x": 0, "y": 0, "w": 6, "h": 4}],
        )
    )
    db.add(QuickNote(id=1, content="Remember the thing"))
    algebra = Module(id=7, name="Algebra", code="MA101", color="#ff0000", created_at=T0, banner={"ring": "grade"})
    stats = Module(id=9, name="Statistics", created_at=T0)
    db.add_all([algebra, stats])
    db.add(ModuleLink(module_id=7, related_module_id=9))
    db.add(ModuleLink(module_id=9, related_module_id=7))
    topic = Submodule(id=3, module=algebra, title="Groups", content_markdown="![[x.png]]", created_at=T0, updated_at=T0)
    exam = Assignment(
        id=4,
        module=algebra,
        title="Final",
        weight_percent=Decimal("60.50"),
        status=AssignmentStatus.not_started,
        kind=AssignmentKind.exam,
        due_at=naive(2026, 12, 1, 9),
        revision_planned_weakness={"3": 0.4},
        covered_submodules=[topic],
    )
    db.add(exam)
    db.add(AssignmentTodo(id=2, assignment=exam, text="Past paper", created_at=T0))
    lecture = Lecture(id=5, module=algebra, title="Lecture 1", scheduled_at=naive(2026, 10, 2, 10), submodules=[topic])
    db.add(lecture)
    card = Flashcard(
        id=11, module=algebra, submodule=topic, front="Q", back="A", source=FlashcardSource.ai, due_at=T0
    )
    db.add(card)
    db.add(FlashcardReview(id=12, flashcard=card, quality=4, reviewed_at=T0))
    db.add(RevisionSession(id=13, assignment=exam, starts_at=T0, duration_minutes=60, submodules=[topic]))
    feed = CalendarFeed(id=2, name="Uni", color="#00ff00", url=None, source_text="BEGIN:VCALENDAR", created_at=T0)
    db.add(feed)
    db.add(CalendarFeedLink(id=1, feed=feed, title="MA101 Lecture", module_id=7))
    db.add(CalendarFeedEvent(id=1, feed=feed, title="Busy", starts_at=T0, ends_at=T0, all_day=False))
    db.add(
        PersonalEvent(
            id=6,
            title="Work",
            weekdays=[0, 2],
            start_time=time(18),
            end_time=time(22, 30),
            valid_from=date(2026, 9, 1),
            created_at=T0,
        )
    )
    db.add(QuickTodo(id=8, text="Buy paper", module_id=9, created_at=T0))

    stored = upload_dir / "submodules" / "3" / "abc.png"
    stored.parent.mkdir(parents=True)
    stored.write_bytes(b"png bytes")
    db.add(
        Attachment(
            id=21,
            submodule=topic,
            kind=AttachmentKind.image,
            filename="x.png",
            file_path="submodules/3/abc.png",
            uploaded_at=T0,
        )
    )
    db.commit()


def snapshot(db: Session) -> dict[str, list[dict]]:
    return {
        table.name: [dict(row) for row in db.execute(select(table).order_by(*table.primary_key.columns)).mappings()]
        for table in Base.metadata.sorted_tables
    }


def make_zip(path: Path, files: dict[str, bytes | str]) -> Path:
    with zipfile.ZipFile(path, "w") as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return path


def manifest(**overrides) -> str:
    return json.dumps(
        {
            "format": "studybook-backup",
            "format_version": 1,
            "alembic_revision": backup_service.current_revision(),
            "created_at": "2026-10-04T12:00:00+00:00",
        }
        | overrides
    )


def test_round_trip_restores_every_row_id_and_file(db, upload_dir, tmp_path):
    seed(db, upload_dir)
    before = snapshot(db)
    assert all(before.values()), [name for name, rows in before.items() if not rows]  # every table seeded
    out = tmp_path / "backup.zip"
    write_backup(db, out, upload_dir=upload_dir)

    # Change everything after the backup: edit, delete, add rows and files.
    db.get(Module, 7).name = "Changed"
    db.delete(db.get(Module, 9))
    db.add(Module(id=30, name="New since", created_at=T0))
    db.commit()
    (upload_dir / "submodules" / "3" / "abc.png").write_bytes(b"overwritten")
    (upload_dir / "stray.txt").write_text("added later")

    restore_backup(db, read_backup(out), upload_dir=upload_dir)

    assert snapshot(db) == before
    assert (upload_dir / "submodules" / "3" / "abc.png").read_bytes() == b"png bytes"
    assert not (upload_dir / "stray.txt").exists()
    assert sorted(p.name for p in tmp_path.iterdir()) == ["backup.zip", "uploads"]  # no staging folders left


def test_backup_stores_portable_values_and_no_api_keys(db, upload_dir, tmp_path):
    seed(db, upload_dir)
    out = tmp_path / "backup.zip"
    write_backup(db, out, upload_dir=upload_dir)

    with zipfile.ZipFile(out) as zf:
        names = set(zf.namelist())
        settings_row = json.loads(zf.read("tables/app_settings.json"))[0]
        attachment = json.loads(zf.read("tables/attachments.json"))[0]
        event = json.loads(zf.read("tables/personal_events.json"))[0]
        assignment = json.loads(zf.read("tables/assignments.json"))[0]
        meta = json.loads(zf.read("manifest.json"))
    assert {"manifest.json", "uploads/submodules/3/abc.png", "tables/assignment_submodules.json"} <= names
    assert "anthropic_api_key" not in settings_row and "gemini_api_key" not in settings_row
    assert attachment["file_path"] == "submodules/3/abc.png"
    assert event["weekdays"] == [0, 2] and event["start_time"] == "18:00:00"
    assert assignment["weight_percent"] == "60.50" and assignment["kind"] == "exam"
    assert meta["counts"]["modules"] == 2 and meta["alembic_revision"] == backup_service.current_revision()


def test_restore_keeps_the_current_installs_api_keys(db, upload_dir, tmp_path):
    seed(db, upload_dir)
    out = tmp_path / "backup.zip"
    write_backup(db, out, upload_dir=upload_dir)
    db.get(AppSettings, 1).anthropic_api_key = "sk-ant-newer"
    db.get(AppSettings, 1).gemini_api_key = "gemini-key"
    db.commit()

    restore_backup(db, read_backup(out), upload_dir=upload_dir)

    db.expire_all()
    row = db.get(AppSettings, 1)
    assert (row.anthropic_api_key, row.gemini_api_key) == ("sk-ant-newer", "gemini-key")
    assert row.dashboard_layout == [{"i": "calendar", "x": 0, "y": 0, "w": 6, "h": 4}]


@pytest.mark.parametrize(
    ("files", "message"),
    [
        ({"notes.txt": "hi"}, "isn't a StudyBook backup"),
        ({"manifest.json": json.dumps({"format": "something-else"})}, "isn't a StudyBook backup"),
        ({"manifest.json": "{not json"}, "manifest can't be read"),
        ({"manifest.json": manifest(format_version=2)}, "newer version of StudyBook"),
        ({"manifest.json": manifest(alembic_revision="ffffffffffff")}, "newer version of StudyBook"),
        ({"manifest.json": manifest(), "uploads/../../evil.sh": "x"}, "unexpected file"),
        ({"manifest.json": manifest(), "/etc/passwd": "x"}, "unexpected file"),
        ({"manifest.json": manifest(), "tables/nope.json": "[]"}, "unexpected file"),
        ({"manifest.json": manifest(), "tables/modules.json": '[{"id": 1, "name": "A", "colour": "x"}]'}, "unknown column"),
        ({"manifest.json": manifest(), "tables/modules.json": '{"id": 1}'}, "isn't a list of rows"),
        ({"manifest.json": manifest(), "tables/lectures.json": '[{"id": 1, "scheduled_at": "soon"}]'}, "bad value"),
        (
            {"manifest.json": manifest(), "tables/attachments.json": '[{"id": 1, "file_path": "../../etc/passwd"}]'},
            "outside the upload folder",
        ),
    ],
)
def test_read_rejects_unrestorable_backups(tmp_path, files, message):
    with pytest.raises(BackupError, match=message):
        read_backup(make_zip(tmp_path / "bad.zip", files))


def test_read_rejects_a_file_that_isnt_a_zip(tmp_path):
    path = tmp_path / "bad.zip"
    path.write_text("plain text")
    with pytest.raises(BackupError, match="isn't a StudyBook backup"):
        read_backup(path)


def test_older_backup_drops_tables_and_columns_since_removed(tmp_path):
    older = next(iter(backup_service._script_directory().walk_revisions())).down_revision
    path = make_zip(
        tmp_path / "old.zip",
        {
            "manifest.json": manifest(alembic_revision=older),
            "tables/modules.json": '[{"id": 1, "name": "A", "created_at": "2026-01-01T00:00:00", "gone": 1}]',
            "tables/notes.json": "[]",
        },
    )
    parsed = read_backup(path)
    assert parsed.rows["modules"] == [{"id": 1, "name": "A", "created_at": naive(2026, 1, 1)}]
    assert parsed.rows["lectures"] == []


def test_failed_restore_changes_nothing(db, upload_dir, tmp_path):
    seed(db, upload_dir)
    before = snapshot(db)
    path = make_zip(
        tmp_path / "broken.zip",
        {
            "manifest.json": manifest(),
            "tables/modules.json": '[{"id": 1, "created_at": "2026-01-01T00:00:00"}]',  # no name: NOT NULL fails
            "uploads/new.png": "new",
        },
    )

    with pytest.raises(Exception):  # noqa: B017  (the DB's IntegrityError)
        restore_backup(db, read_backup(path), upload_dir=upload_dir)

    assert snapshot(db) == before
    assert (upload_dir / "submodules" / "3" / "abc.png").read_bytes() == b"png bytes"
    assert not (upload_dir / "new.png").exists()
    assert sorted(p.name for p in tmp_path.iterdir()) == ["broken.zip", "uploads"]


def test_download_endpoint_returns_a_restorable_zip(client, db, upload_dir, tmp_path):
    seed(db, upload_dir)

    response = client.get("/backup")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert 'filename="studybook-backup-' in response.headers["content-disposition"]
    path = tmp_path / "downloaded.zip"
    path.write_bytes(response.content)
    assert read_backup(path).counts["modules"] == 2


def test_restore_endpoint_replaces_data_and_keeps_a_pre_restore_copy(client, db, upload_dir, tmp_path):
    seed(db, upload_dir)
    backup_bytes = client.get("/backup").content
    db.delete(db.get(Module, 9))
    db.commit()

    def restore():
        response = client.post("/backup/restore", files={"file": ("b.zip", io.BytesIO(backup_bytes), "application/zip")})
        assert response.status_code == 200, response.text
        return response.json()

    body = restore()
    assert body["counts"]["modules"] == 2
    db.expire_all()
    assert db.get(Module, 9).name == "Statistics"
    assert read_backup(Path(body["pre_restore_backup"])).counts["modules"] == 1  # the data the restore replaced

    for _ in range(3):
        body = restore()
    copies = sorted((tmp_path / "backups").glob("pre-restore-*.zip"))
    assert len(copies) == 3  # older automatic copies are pruned
    assert body["pre_restore_backup"] == str(copies[-1].resolve())


def test_restore_endpoint_rejects_a_bad_file_untouched(client, db, upload_dir, tmp_path):
    seed(db, upload_dir)

    response = client.post("/backup/restore", files={"file": ("x.zip", io.BytesIO(b"nope"), "application/zip")})

    assert response.status_code == 422
    assert "isn't a StudyBook backup" in response.json()["detail"]
    assert db.get(Module, 9) is not None
    assert not (tmp_path / "backups").exists()


def test_backup_of_an_old_database_makes_its_upload_folder_paths_relative(db, upload_dir, tmp_path):
    # Before c3d9e5a1b7f2, file_path included the upload folder; the automatic pre-upgrade backup sees those.
    seed(db, upload_dir)
    db.get(Attachment, 21).file_path = str(upload_dir / "submodules" / "3" / "abc.png")
    db.commit()
    out = tmp_path / "backup.zip"

    write_backup(db, out, upload_dir=upload_dir)

    with zipfile.ZipFile(out) as zf:
        assert json.loads(zf.read("tables/attachments.json"))[0]["file_path"] == "submodules/3/abc.png"
