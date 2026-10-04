"""Schema setup at startup, against throwaway SQLite files (never the dev database): a new database gets
the models' schema stamped at the Alembic head, an up-to-date one is left alone, and an older one is
backed up before it's upgraded."""

import json
import zipfile
from pathlib import Path

import pytest
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

import app.models  # noqa: F401  (registers every table)
from alembic import command
from app.core import migrate
from app.core.config import Settings, settings
from app.core.database import Base, create_sqlite_engine
from app.models import Module
from app.services.backup import current_revision


@pytest.fixture
def data_dir(tmp_path, monkeypatch) -> Path:
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))
    monkeypatch.setattr(settings, "backup_dir", str(tmp_path / "backups"))
    return tmp_path


def version(engine) -> str | None:
    with engine.connect() as connection:
        return connection.execute(text("SELECT version_num FROM alembic_version")).scalar()


def test_new_database_gets_every_table_at_the_head(data_dir):
    engine = create_sqlite_engine(f"sqlite:///{data_dir / 'studybook.db'}")

    migrate.ensure_schema(engine)

    tables = set(inspect(engine).get_table_names())
    assert {table.name for table in Base.metadata.sorted_tables} <= tables
    assert version(engine) == current_revision()
    with Session(engine) as db:  # server defaults work on SQLite
        db.add(Module(name="Algorithms"))
        db.commit()
        assert db.query(Module).one().created_at is not None


def test_up_to_date_database_is_left_alone(data_dir, monkeypatch):
    engine = create_sqlite_engine(f"sqlite:///{data_dir / 'studybook.db'}")
    migrate.ensure_schema(engine)
    monkeypatch.setattr(command, "upgrade", lambda *_args: pytest.fail("upgraded an up-to-date database"))

    migrate.ensure_schema(engine)

    assert not (data_dir / "backups").exists()


def test_older_database_is_backed_up_then_upgraded(data_dir, monkeypatch):
    engine = create_sqlite_engine(f"sqlite:///{data_dir / 'studybook.db'}")
    migrate.ensure_schema(engine)
    with Session(engine) as db:
        db.add(Module(id=4, name="Algorithms"))
        db.commit()
    previous = ScriptDirectory.from_config(migrate._alembic_config()).get_revision(current_revision()).down_revision
    with engine.begin() as connection:
        connection.execute(text("UPDATE alembic_version SET version_num = :rev"), {"rev": previous})
    upgrades = []
    monkeypatch.setattr(command, "upgrade", lambda config, target: upgrades.append(target))

    migrate.ensure_schema(engine)

    assert upgrades == ["head"]
    backup = data_dir / "backups" / f"pre-upgrade-{previous}.zip"
    with zipfile.ZipFile(backup) as zf:
        assert json.loads(zf.read("manifest.json"))["alembic_revision"] == previous
        assert json.loads(zf.read("tables/modules.json"))[0]["name"] == "Algorithms"


def test_tables_without_a_version_are_refused(data_dir):
    engine = create_sqlite_engine(f"sqlite:///{data_dir / 'studybook.db'}")
    Base.metadata.create_all(engine)

    with pytest.raises(RuntimeError, match="no Alembic version"):
        migrate.ensure_schema(engine)


def test_paths_default_to_inside_the_data_folder(tmp_path, monkeypatch):
    # conftest pins DATABASE_URL, and magika (via markitdown) copies a developer's `.env` into the
    # environment when it's imported.
    for name in ("DATABASE_URL", "UPLOAD_DIR", "BACKUP_DIR"):
        monkeypatch.delenv(name, raising=False)
    derived = Settings(data_dir=tmp_path, _env_file=None)

    assert derived.database_url == f"sqlite:///{tmp_path / 'studybook.db'}"
    assert derived.upload_dir == str(tmp_path / "uploads")
    assert derived.backup_dir == str(tmp_path / "backups")
