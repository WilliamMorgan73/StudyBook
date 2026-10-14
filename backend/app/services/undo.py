"""Undo for deletes (#118): every user-facing delete keeps what it removed for a short while, so the
"Deleted X · Undo" toast can put it back exactly, ids included (note embeds, wikilinks and layouts
point at ids).

`delete_with_undo` reads every row the delete could touch before deleting, through Core: the object's
own row, then, table by table in dependency order, every row with a foreign key pointing at a row
already read. That covers ORM cascades, DB-only cascades (`module_links`, `quick_todos`,
`calendar_feed_links`, the link tables) and `SET NULL` (a topic's flashcards). After the ORM delete
flushes, the same rows are read again by primary key: the ones gone are kept to re-insert, the ones
changed keep their old values. Removed Attachments' files are copied aside before the commit (the
session hooks in `app/models/attachment.py` then delete the originals as usual).

Each undo lives in `<undo_dir>/<token>/` (`snapshot.json` plus `files/<file_path>`), outside the upload
folder so backups never include it, and is purged after `UNDO_TTL`.
"""

import json
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import Table, or_, select, tuple_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.core.database import Base
from app.services.backup import decode_row, encode_value

# The toast shows for about 8 s; this leaves room for a slow click, then the undo is gone.
UNDO_TTL_SECONDS = 120

_SNAPSHOT = "snapshot.json"
_FILES = "files"


class UndoNotFoundError(Exception):
    """No undo for this token: never existed, already used, or expired."""


class UndoConflictError(Exception):
    """The rows can't go back, e.g. something they belonged to was deleted since. The message is shown as-is."""


Key = tuple[Any, ...]


def _key(table: Table, row: dict[str, Any]) -> Key:
    return tuple(row[c.name] for c in table.primary_key.columns)


def _by_key(db: Session, table: Table, keys: list[Key]) -> dict[Key, dict[str, Any]]:
    pk = list(table.primary_key.columns)
    if not keys:
        return {}
    where = pk[0].in_([k[0] for k in keys]) if len(pk) == 1 else tuple_(*pk).in_(keys)
    return {_key(table, dict(r)): dict(r) for r in db.execute(select(table).where(where)).mappings()}


# Columns some foreign key points at, by table (in practice each table's `id`).
_REFERENCED_COLUMNS: dict[str, set[str]] = {}
for _table in Base.metadata.sorted_tables:
    for _fk in _table.foreign_keys:
        _REFERENCED_COLUMNS.setdefault(_fk.column.table.name, set()).add(_fk.column.name)


def _rows_touched_by(db: Session, root: Table, root_key: Key) -> dict[str, dict[Key, dict[str, Any]]]:
    """Every row the delete of `root_key` could remove or change, by table, read before anything changes."""
    touched: dict[str, dict[Key, dict[str, Any]]] = {root.name: _by_key(db, root, [root_key])}
    # Values of each referenced column among the rows read so far, e.g. {"modules": {"id": {3}}}.
    referenced: dict[str, dict[str, set[Any]]] = {}

    def note(table: Table, rows: dict[Key, dict[str, Any]]) -> None:
        cols = referenced.setdefault(table.name, {})
        for name in _REFERENCED_COLUMNS.get(table.name, ()):
            cols.setdefault(name, set()).update(row[name] for row in rows.values())

    note(root, touched[root.name])
    # sorted_tables puts every table after the tables it references, so one pass reaches every dependant.
    for table in Base.metadata.sorted_tables:
        if table is root:
            continue
        conditions = []
        for fk in table.foreign_keys:
            values = referenced.get(fk.column.table.name, {}).get(fk.column.name)
            if values:
                conditions.append(fk.parent.in_(values))
        if not conditions:
            continue
        rows = {_key(table, dict(r)): dict(r) for r in db.execute(select(table).where(or_(*conditions))).mappings()}
        if rows:
            touched[table.name] = rows
            note(table, rows)
    return touched


def _undo_dir() -> Path:
    from app.core.config import settings

    return Path(settings.undo_dir)


def _upload_dir() -> Path:
    from app.core.config import settings

    return Path(settings.upload_dir)


def purge_expired(undo_dir: Path | None = None, *, now: float | None = None) -> None:
    """Delete undo folders older than `UNDO_TTL_SECONDS`."""
    undo_dir = undo_dir or _undo_dir()
    now = time.time() if now is None else now
    if not undo_dir.is_dir():
        return
    for folder in undo_dir.iterdir():
        try:
            if folder.is_dir() and now - folder.stat().st_mtime > UNDO_TTL_SECONDS:
                shutil.rmtree(folder, ignore_errors=True)
        except OSError:
            pass


def delete_with_undo(db: Session, obj: Any) -> str:
    """Delete `obj` (through the ORM, so its cascades and file hooks run), commit, and return an undo token."""
    purge_expired()
    table: Table = obj.__table__
    mapper_pk = tuple(getattr(obj, c.key) for c in obj.__mapper__.primary_key)
    before = _rows_touched_by(db, table, mapper_pk)

    db.delete(obj)
    db.flush()

    removed: dict[str, list[dict[str, Any]]] = {}
    changed: dict[str, list[dict[str, Any]]] = {}
    for name, rows in before.items():
        t = Base.metadata.tables[name]
        after = _by_key(db, t, list(rows))
        for key, old in rows.items():
            new = after.get(key)
            if new is None:
                removed.setdefault(name, []).append(old)
            elif new != old:
                # The primary key plus the columns the delete changed (e.g. a flashcard's submodule_id).
                diff = {c.name: old[c.name] for c in t.primary_key.columns}
                diff.update({col: value for col, value in old.items() if new[col] != value})
                changed.setdefault(name, []).append(diff)

    token = uuid.uuid4().hex
    folder = _undo_dir() / token
    upload_dir = _upload_dir()
    try:
        folder.mkdir(parents=True)
        for row in removed.get("attachments", []):
            source = upload_dir / row["file_path"]
            if source.is_file():
                dest = folder / _FILES / row["file_path"]
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, dest)
        snapshot = {
            "removed": {n: [{k: encode_value(v) for k, v in r.items()} for r in rows] for n, rows in removed.items()},
            "changed": {n: [{k: encode_value(v) for k, v in r.items()} for r in rows] for n, rows in changed.items()},
        }
        (folder / _SNAPSHOT).write_text(json.dumps(snapshot))
        db.commit()
    except BaseException:
        db.rollback()
        shutil.rmtree(folder, ignore_errors=True)
        raise
    return token


def undo_delete(db: Session, token: str) -> None:
    """Put back everything one delete removed or changed. The token is used up on success."""
    purge_expired()
    if not token.isalnum():
        raise UndoNotFoundError
    folder = _undo_dir() / token
    try:
        snapshot = json.loads((folder / _SNAPSHOT).read_text())
    except (OSError, ValueError) as exc:
        raise UndoNotFoundError from exc

    tables = Base.metadata.tables
    upload_dir = _upload_dir()
    restored_files: list[Path] = []
    try:
        # Parents before children, so foreign keys hold as rows go in.
        for table in Base.metadata.sorted_tables:
            rows = snapshot["removed"].get(table.name)
            if rows:
                db.execute(table.insert(), [decode_row(table, r, drop_unknown=False) for r in rows])
        for name, rows in snapshot["changed"].items():
            t = tables[name]
            for raw in rows:
                row = decode_row(t, raw, drop_unknown=False)
                pk = [c for c in t.primary_key.columns]
                values = {k: v for k, v in row.items() if k not in {c.name for c in pk}}
                db.execute(update(t).where(*(c == row[c.name] for c in pk)).values(values))
        files = folder / _FILES
        for row in snapshot["removed"].get("attachments", []):
            source = files / row["file_path"]
            if source.is_file():
                dest = upload_dir / row["file_path"]
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, dest)
                restored_files.append(dest)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        for path in restored_files:
            path.unlink(missing_ok=True)
        raise UndoConflictError("Couldn't undo: something it belonged to has changed since.") from exc
    except BaseException:
        db.rollback()
        for path in restored_files:
            path.unlink(missing_ok=True)
        raise
    shutil.rmtree(folder, ignore_errors=True)
