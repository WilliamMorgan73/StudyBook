"""Scheduled backups: a full backup zip (`write_backup`) written to the backup folder every N days.

`backup_if_due` runs at server start and then every `CHECK_INTERVAL_SECONDS` (`main.py`'s lifespan). A
backup is due when automatic backups are on and the newest `auto-*.zip` is at least `auto_backup_interval_days`
old (by file time), or there is none. Only `auto-*.zip` files are pruned, to the newest `auto_backup_keep`;
pre-restore and pre-upgrade copies are never touched.

A zip is written under a `.partial` name and renamed once complete, so a backup cut short (the app closed
mid-write) never looks like a real one; leftover partials are deleted on the next run. The last failure is
kept in memory (`last_error`) for Settings → Data and cleared by the next success.
"""

import logging
import threading
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app.crud.app_settings import get_or_create_settings
from app.services.backup import write_backup

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = 60 * 60
AUTO_PREFIX = "auto-"
_PARTIAL_SUFFIX = ".partial"

# One backup or restore at a time: a restore swaps the upload folder a backup may be reading.
backup_lock = threading.Lock()


@dataclass
class AutoBackupFailure:
    at: datetime  # UTC
    message: str


last_error: AutoBackupFailure | None = None


def automatic_backups(folder: Path) -> list[Path]:
    """Every finished automatic backup, oldest first (the names sort by time)."""
    return sorted(folder.glob(f"{AUTO_PREFIX}*.zip"))


def file_time(path: Path) -> datetime:
    """When a backup file was last written, in UTC."""
    return datetime.fromtimestamp(path.stat().st_mtime, UTC)


def backup_if_due(db: Session, *, backup_dir: Path, upload_dir: Path, now: datetime | None = None) -> Path | None:
    """Write an automatic backup if one is due, then prune old ones. Returns the new zip, if any.

    Never raises: a failure is logged and kept in `last_error` for Settings to show.
    """
    global last_error
    now = now or datetime.now(UTC)
    try:
        row = get_or_create_settings(db)
        if not row.auto_backup_enabled:
            return None
        backup_dir.mkdir(parents=True, exist_ok=True)
        for partial in backup_dir.glob(f"{AUTO_PREFIX}*{_PARTIAL_SUFFIX}"):
            partial.unlink(missing_ok=True)
        existing = automatic_backups(backup_dir)
        if existing and now - file_time(existing[-1]) < timedelta(days=row.auto_backup_interval_days):
            return None
        with backup_lock:
            out = backup_dir / f"{AUTO_PREFIX}{now.astimezone().strftime('%Y%m%d-%H%M%S')}.zip"
            partial = out.with_name(out.name + _PARTIAL_SUFFIX)
            try:
                write_backup(db, partial, upload_dir=upload_dir)
                partial.replace(out)
            finally:
                partial.unlink(missing_ok=True)
        for old in automatic_backups(backup_dir)[: -row.auto_backup_keep]:
            old.unlink(missing_ok=True)
    except Exception as exc:
        logger.exception("Automatic backup failed")
        last_error = AutoBackupFailure(at=now, message=str(exc) or type(exc).__name__)
        return None
    last_error = None
    return out
