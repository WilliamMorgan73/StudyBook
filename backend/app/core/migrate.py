"""Bring the database's schema up to date when the app starts, so nobody ever runs Alembic by hand.

- A new, empty database gets the current schema straight from the models (`create_all`) and is
  stamped at the Alembic head. The migrations before the switch to SQLite were written for Postgres
  and can't build a schema from scratch; they stay in `alembic/versions/` because backups record
  their revision ids.
- An existing database behind the head is backed up first (`backups/pre-upgrade-<revision>.zip`),
  then upgraded.
"""

import logging
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Engine, inspect
from sqlalchemy.orm import Session

import app.models  # noqa: F401  (registers every table on Base.metadata)
from alembic import command
from app.core.config import settings
from app.core.database import Base
from app.services.backup import current_revision, write_backup

log = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parents[2]


def _alembic_config() -> Config:
    config = Config(str(_BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(_BACKEND_DIR / "alembic"))
    return config


def ensure_schema(engine: Engine) -> None:
    head = current_revision()
    with engine.connect() as connection:
        fresh = not inspect(connection).has_table("alembic_version") and not any(
            inspect(connection).has_table(table.name) for table in Base.metadata.sorted_tables
        )
        revision = None if fresh else MigrationContext.configure(connection).get_current_revision()
    if revision == head:
        return
    if revision is None and not fresh:
        raise RuntimeError(
            f"The database at {settings.database_url} has tables but no Alembic version, so its schema is unknown."
        )

    config = _alembic_config()
    if fresh:
        log.info("Creating a new database schema at %s", head)
        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.stamp(config, "head")
        return

    backup_dir = Path(settings.backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)
    with Session(engine) as db:
        write_backup(
            db, backup_dir / f"pre-upgrade-{revision}.zip", upload_dir=Path(settings.upload_dir), revision=revision
        )
    log.info("Upgrading the database schema from %s to %s", revision, head)
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
