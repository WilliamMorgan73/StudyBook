"""An Attachment's file leaves the disk with its row, whichever delete removes the row (the
Attachment itself, or a Submodule / Assignment / Module cascading to it), and only once the
delete commits. Runs against a throwaway in-memory SQLite database and a tmp upload dir."""

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers relationship string refs (the name `app` is rebound below)
from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app
from app.models.assignment import Assignment
from app.models.attachment import Attachment
from app.models.enums import AttachmentKind
from app.models.module import Module
from app.models.submodule import Submodule

NOW = datetime(2026, 10, 2, 12, 0, tzinfo=UTC).replace(tzinfo=None)


@pytest.fixture
def upload_dir(tmp_path, monkeypatch) -> Path:
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    return tmp_path


@pytest.fixture
def db(monkeypatch, upload_dir) -> Iterator[Session]:
    # `updated_at`'s onupdate is the Postgres string "now()", which SQLite's DateTime rejects.
    monkeypatch.setattr(Submodule.__table__.c.updated_at, "onupdate", None)
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    for table in Base.metadata.sorted_tables:
        if table.name != "personal_events":  # Postgres int array; not involved here
            table.create(engine)
    session = sessionmaker(bind=engine)()
    session.add(Module(id=1, name="Biology", created_at=NOW))
    session.add(Module(id=2, name="Chemistry", created_at=NOW))
    for sid, module_id in ((1, 1), (2, 1), (3, 2)):
        session.add(Submodule(id=sid, module_id=module_id, title=f"Topic {sid}", content_markdown="", created_at=NOW, updated_at=NOW))
    session.add(Assignment(id=1, module_id=1, title="Essay", weight_percent=50))
    session.commit()
    yield session
    session.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def attach(db: Session, upload_dir: Path, *, submodule_id: int | None = None, assignment_id: int | None = None) -> Path:
    """An Attachment row plus its file, laid out like store_upload does."""
    owner = f"submodules/{submodule_id}" if submodule_id else f"assignments/{assignment_id}"
    folder = upload_dir / owner
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"file{len(list(folder.iterdir()))}.pdf"
    path.write_bytes(b"%PDF")
    db.add(Attachment(submodule_id=submodule_id, assignment_id=assignment_id, kind=AttachmentKind.pdf,
                      filename=path.name, file_path=str(path), uploaded_at=NOW))
    db.commit()
    return path


def test_deleting_a_submodule_removes_its_files_and_folder(client, db, upload_dir):
    mine = [attach(db, upload_dir, submodule_id=1), attach(db, upload_dir, submodule_id=1)]
    other = attach(db, upload_dir, submodule_id=2)

    assert client.delete("/submodules/1").status_code == 204

    assert not any(path.exists() for path in mine)
    assert not (upload_dir / "submodules" / "1").exists()
    assert other.exists()


def test_deleting_an_assignment_removes_its_files(client, db, upload_dir):
    path = attach(db, upload_dir, assignment_id=1)

    assert client.delete("/assignments/1").status_code == 204

    assert not path.exists()


def test_deleting_a_module_removes_files_of_its_submodules_and_assignments(client, db, upload_dir):
    removed = [attach(db, upload_dir, submodule_id=1), attach(db, upload_dir, submodule_id=2),
               attach(db, upload_dir, assignment_id=1)]
    kept = attach(db, upload_dir, submodule_id=3)  # module 2

    assert client.delete("/modules/1").status_code == 204

    assert not any(path.exists() for path in removed)
    assert kept.exists()


def test_deleting_an_attachment_removes_its_file(client, db, upload_dir):
    path = attach(db, upload_dir, submodule_id=1)
    sibling = attach(db, upload_dir, submodule_id=1)
    attachment_id = db.query(Attachment).filter_by(file_path=str(path)).one().id

    assert client.delete(f"/attachments/{attachment_id}").status_code == 204

    assert not path.exists()
    assert sibling.exists()  # the folder stays while it still holds files


def test_a_rolled_back_delete_keeps_the_file(db, upload_dir):
    path = attach(db, upload_dir, submodule_id=1)

    db.delete(db.get(Submodule, 1))
    db.flush()
    db.rollback()
    db.get(Submodule, 2).title = "Renamed"
    db.commit()  # a later commit must not act on the rolled-back delete

    assert path.exists()
    assert db.get(Submodule, 1) is not None


def test_a_missing_file_does_not_break_the_delete(client, db, upload_dir):
    path = attach(db, upload_dir, submodule_id=1)
    path.unlink()

    assert client.delete("/submodules/1").status_code == 204


def test_never_deletes_outside_the_upload_dir(db, upload_dir, tmp_path_factory):
    outside = tmp_path_factory.mktemp("elsewhere") / "keep.pdf"
    outside.write_bytes(b"%PDF")
    db.add(Attachment(submodule_id=1, kind=AttachmentKind.pdf, filename="keep.pdf", file_path=str(outside), uploaded_at=NOW))
    db.commit()

    db.delete(db.get(Submodule, 1))
    db.commit()

    assert outside.exists()
