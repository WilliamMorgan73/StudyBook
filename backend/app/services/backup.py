"""Full backups: every table plus the upload folder, in one zip that any supported database can restore.

Layout of a backup zip:

- `manifest.json`: `format`, `format_version`, `alembic_revision` (the schema the rows were written in),
  `created_at` (UTC), per-table row `counts`.
- `tables/<table>.json`: a list of row objects per table in `Base.metadata`, link tables included.
- `uploads/<path>`: the whole upload folder, at paths relative to it. `attachments.file_path` is stored
  relative to the upload folder too, and rebuilt against the restoring install's folder.

Restore replaces everything: rows keep their original ids, since note embeds point at `/uploads/...` URLs
and layouts hold ids. The saved AI API keys are never written to a backup, and a restore keeps the
current install's. Everything goes through SQLAlchemy Core (not the ORM), so the Attachment session hooks
that delete files never fire.
"""

import json
import shutil
import uuid
import zipfile
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from decimal import Decimal
from enum import Enum
from pathlib import Path, PurePosixPath
from typing import Any

from alembic.script import ScriptDirectory
from sqlalchemy import Date, DateTime, Numeric, Table, Time, inspect, select
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Session

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.core.database import Base

FORMAT = "studybook-backup"
FORMAT_VERSION = 1

# Never written to a backup; a restore keeps the current install's values.
SECRET_COLUMNS: dict[str, tuple[str, ...]] = {"app_settings": ("anthropic_api_key", "gemini_api_key")}

_ALEMBIC_DIR = Path(__file__).resolve().parents[2] / "alembic"


class BackupError(Exception):
    """A backup that can't be restored; the message is shown to the student as-is."""


@dataclass
class ParsedBackup:
    """A validated backup, decoded and ready to restore."""

    zip_path: Path
    created_at: str
    alembic_revision: str
    rows: dict[str, list[dict[str, Any]]]  # table name -> decoded rows, every known table present
    upload_files: list[str]  # zip member names under uploads/

    @property
    def counts(self) -> dict[str, int]:
        return {name: len(rows) for name, rows in self.rows.items()}


def _tables() -> list[Table]:
    return list(Base.metadata.sorted_tables)


def _script_directory() -> ScriptDirectory:
    return ScriptDirectory(str(_ALEMBIC_DIR))


def current_revision() -> str:
    head = _script_directory().get_current_head()
    assert head is not None
    return head


# --- encoding --------------------------------------------------------------------------------------------


def _encode(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.name  # SQLAlchemy's Enum stores (and accepts) member names
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def _decoder(column_type: Any):
    if isinstance(column_type, DateTime):
        return datetime.fromisoformat
    if isinstance(column_type, Date):
        return date.fromisoformat
    if isinstance(column_type, Time):
        return time.fromisoformat
    if isinstance(column_type, SAEnum):
        return str
    if isinstance(column_type, Numeric):
        return Decimal if column_type.asdecimal else float
    return None


def _decode_row(table: Table, row: Any, *, drop_unknown: bool) -> dict[str, Any]:
    if not isinstance(row, dict):
        raise BackupError(f"The backup is damaged: a row in {table.name} isn't an object.")
    secrets = SECRET_COLUMNS.get(table.name, ())
    decoded: dict[str, Any] = {}
    for name, value in row.items():
        if name in secrets:
            continue
        if name not in table.columns:
            if drop_unknown:
                continue
            raise BackupError(f"The backup is damaged: {table.name} has an unknown column {name!r}.")
        decode = _decoder(table.columns[name].type)
        if value is not None and decode is not None:
            try:
                value = decode(value)
            except (TypeError, ValueError, ArithmeticError) as exc:
                raise BackupError(f"The backup is damaged: bad value for {table.name}.{name}.") from exc
        decoded[name] = value
    return decoded


# --- writing ---------------------------------------------------------------------------------------------


def write_backup(db: Session, out_path: Path, *, upload_dir: Path, revision: str | None = None) -> dict[str, Any]:
    """Write a backup of the whole database and upload folder to `out_path`; returns the manifest.

    `revision` is the schema the database is actually at, when that isn't the code's head (the
    automatic backup taken just before an upgrade): only the tables and columns that exist are read,
    and a restore fills in the rest as it would for any older backup.
    """
    upload_root = upload_dir.resolve()
    inspector = inspect(db.connection())
    counts: dict[str, int] = {}
    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for table in _tables():
            if not inspector.has_table(table.name):
                continue
            existing = {column["name"] for column in inspector.get_columns(table.name)}
            secrets = SECRET_COLUMNS.get(table.name, ())
            columns = [column for column in table.columns if column.name in existing and column.name not in secrets]
            rows = []
            for row in db.execute(select(*columns)).mappings():
                encoded = {key: _encode(value) for key, value in row.items()}
                if table.name == "attachments":
                    encoded["file_path"] = _relative_upload_path(encoded["file_path"], upload_root)
                rows.append(encoded)
            counts[table.name] = len(rows)
            zf.writestr(f"tables/{table.name}.json", json.dumps(rows, ensure_ascii=False))

        if upload_root.is_dir():
            for path in sorted(upload_root.rglob("*")):
                if path.is_file():
                    zf.write(path, f"uploads/{path.relative_to(upload_root).as_posix()}")

        manifest = {
            "format": FORMAT,
            "format_version": FORMAT_VERSION,
            "alembic_revision": revision or current_revision(),
            "created_at": datetime.now(UTC).isoformat(),
            "counts": counts,
        }
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
    return manifest


def _relative_upload_path(file_path: str, upload_root: Path) -> str:
    path = Path(file_path).resolve()
    if path.is_relative_to(upload_root):
        return path.relative_to(upload_root).as_posix()
    return file_path  # outside the upload folder (shouldn't happen); kept as-is, rejected on restore


# --- reading ---------------------------------------------------------------------------------------------


def _safe_member(name: str) -> bool:
    path = PurePosixPath(name)
    return (
        not path.is_absolute()
        and ".." not in path.parts
        and "\\" not in name
        and (name == "manifest.json" or path.parts[0] in ("tables", "uploads"))
    )


def read_backup(zip_path: Path) -> ParsedBackup:
    """Open and fully validate a backup without touching the database or the upload folder."""
    if not zipfile.is_zipfile(zip_path):
        raise BackupError("That file isn't a StudyBook backup.")
    with zipfile.ZipFile(zip_path) as zf:
        names = [info.filename for info in zf.infolist() if not info.is_dir()]
        if "manifest.json" not in names:
            raise BackupError("That file isn't a StudyBook backup.")
        if bad := next((name for name in names if not _safe_member(name)), None):
            raise BackupError(f"The backup contains an unexpected file ({bad}).")

        try:
            manifest = json.loads(zf.read("manifest.json"))
        except ValueError as exc:
            raise BackupError("The backup is damaged: its manifest can't be read.") from exc
        if not isinstance(manifest, dict) or manifest.get("format") != FORMAT:
            raise BackupError("That file isn't a StudyBook backup.")
        version = manifest.get("format_version")
        if not isinstance(version, int) or version > FORMAT_VERSION:
            raise BackupError("This backup was made by a newer version of StudyBook. Update StudyBook first.")

        revision = manifest.get("alembic_revision")
        script = _script_directory()
        known = {rev.revision for rev in script.walk_revisions()}
        if revision not in known:
            raise BackupError("This backup was made by a newer version of StudyBook. Update StudyBook first.")
        # A backup from an older schema may hold tables and columns that have since been dropped.
        older = revision != script.get_current_head()

        tables = {table.name: table for table in _tables()}
        rows: dict[str, list[dict[str, Any]]] = {name: [] for name in tables}
        for name in names:
            if not name.startswith("tables/"):
                continue
            table_name = PurePosixPath(name).stem
            if not name.endswith(".json") or table_name not in tables:
                if older:
                    continue
                raise BackupError(f"The backup contains an unexpected file ({name}).")
            try:
                raw = json.loads(zf.read(name))
            except ValueError as exc:
                raise BackupError(f"The backup is damaged: {name} can't be read.") from exc
            if not isinstance(raw, list):
                raise BackupError(f"The backup is damaged: {name} isn't a list of rows.")
            table = tables[table_name]
            rows[table_name] = [_decode_row(table, row, drop_unknown=older) for row in raw]

        for attachment in rows["attachments"]:
            file_path = attachment.get("file_path")
            if not isinstance(file_path, str) or not _safe_member(f"uploads/{file_path}"):
                raise BackupError("The backup is damaged: an attachment points outside the upload folder.")

        return ParsedBackup(
            zip_path=zip_path,
            created_at=str(manifest.get("created_at", "")),
            alembic_revision=revision,
            rows=rows,
            upload_files=[name for name in names if name.startswith("uploads/")],
        )


# --- restoring -------------------------------------------------------------------------------------------


def restore_backup(db: Session, backup: ParsedBackup, *, upload_dir: Path) -> None:
    """Replace every row and the whole upload folder with the backup's.

    The new files are unpacked to a staging folder first, and swapped in only after the database commit,
    so a failure at any point before that leaves both the database and the files as they were.
    """
    root = upload_dir.resolve()
    staging = root.parent / f".{root.name}-restore-{uuid.uuid4().hex}"
    try:
        _unpack_uploads(backup, staging)
        _replace_rows(db, backup, upload_dir)
        db.commit()
    except Exception:
        db.rollback()
        shutil.rmtree(staging, ignore_errors=True)
        raise

    old = root.parent / f".{root.name}-old-{uuid.uuid4().hex}"
    if root.exists():
        root.rename(old)
    staging.rename(root)
    shutil.rmtree(old, ignore_errors=True)


def _unpack_uploads(backup: ParsedBackup, staging: Path) -> None:
    staging.mkdir(parents=True)
    with zipfile.ZipFile(backup.zip_path) as zf:
        for name in backup.upload_files:
            dest = staging / PurePosixPath(name).relative_to("uploads")
            dest.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(name) as src, dest.open("wb") as out:
                shutil.copyfileobj(src, out)


def _replace_rows(db: Session, backup: ParsedBackup, upload_dir: Path) -> None:
    tables = _tables()
    kept_secrets = _current_secrets(db)

    for table in reversed(tables):
        db.execute(table.delete())
    for table in tables:
        rows = backup.rows[table.name]
        if table.name == "attachments":
            # The same form `store_upload` writes: the configured upload folder joined with the file's path.
            rows = [{**row, "file_path": str(upload_dir / row["file_path"])} for row in rows]
        if rows:
            db.execute(table.insert(), rows)

    settings_table = Base.metadata.tables["app_settings"]
    if any(kept_secrets.values()):
        if backup.rows["app_settings"]:
            db.execute(settings_table.update().values(**kept_secrets))
        else:
            db.execute(settings_table.insert().values(id=1, **kept_secrets))


def _current_secrets(db: Session) -> dict[str, Any]:
    table = Base.metadata.tables["app_settings"]
    columns = SECRET_COLUMNS["app_settings"]
    row = db.execute(select(*(table.c[name] for name in columns)).limit(1)).first()
    return dict(zip(columns, row, strict=True)) if row else {name: None for name in columns}

