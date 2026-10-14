import re
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.core.clock import local_now
from app.core.config import settings
from app.core.database import get_db
from app.services import auto_backup
from app.services.backup import BackupError, read_backup, restore_backup, write_backup

router = APIRouter(prefix="/backup", tags=["backup"])

# Automatic pre-restore copies kept in `settings.backup_dir`; older ones are deleted.
KEEP_PRE_RESTORE_BACKUPS = 3


class RestoreResult(BaseModel):
    created_at: str
    counts: dict[str, int]
    pre_restore_backup: str


class DataLocation(BaseModel):
    data_dir: str
    """Absolute path of the folder holding the database, uploads and backups."""


SavedBackupKind = Literal["automatic", "pre-restore", "pre-upgrade", "other"]

# A saved backup's file name, as `restore_saved` accepts it: no folders, so it can't leave the backup folder.
_SAVED_NAME = re.compile(r"^[\w.-]+\.zip$")


class SavedBackup(BaseModel):
    name: str
    kind: SavedBackupKind
    created_at: datetime
    """When the file was written (UTC, naive, like the other server timestamps)."""
    size_bytes: int


class AutoBackupError(BaseModel):
    at: datetime
    message: str


class SavedBackups(BaseModel):
    folder: str
    """Absolute path of the backup folder."""
    last_automatic_at: datetime | None
    last_error: AutoBackupError | None
    """The last automatic backup failed; cleared by the next success."""
    backups: list[SavedBackup]
    """Every backup in the folder, newest first."""


@router.get("/location", response_model=DataLocation)
def data_location() -> DataLocation:
    return DataLocation(data_dir=str(Path(settings.data_dir).resolve()))


@router.get("")
def download_backup(db: Session = Depends(get_db)) -> FileResponse:
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        out = Path(tmp.name)
    try:
        write_backup(db, out, upload_dir=Path(settings.upload_dir))
    except Exception:
        out.unlink(missing_ok=True)
        raise
    return FileResponse(
        out,
        media_type="application/zip",
        filename=f"studybook-backup-{local_now().date().isoformat()}.zip",
        background=BackgroundTask(out.unlink, missing_ok=True),
    )


@router.post("/restore", response_model=RestoreResult)
def restore(file: UploadFile, db: Session = Depends(get_db)) -> RestoreResult:
    """Replace everything with the uploaded backup, after saving a copy of the current data."""
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        uploaded = Path(tmp.name)
    try:
        return _restore_from(uploaded, db)
    finally:
        uploaded.unlink(missing_ok=True)


@router.get("/saved", response_model=SavedBackups)
def saved_backups() -> SavedBackups:
    """The backups in the backup folder (automatic, pre-restore and pre-upgrade copies) and how the
    automatic ones are doing."""
    folder = Path(settings.backup_dir)
    files = sorted(folder.glob("*.zip"), key=lambda path: path.stat().st_mtime, reverse=True) if folder.is_dir() else []
    automatic = auto_backup.automatic_backups(folder) if folder.is_dir() else []
    failure = auto_backup.last_error
    return SavedBackups(
        folder=str(folder.resolve()),
        last_automatic_at=_naive_utc(auto_backup.file_time(automatic[-1])) if automatic else None,
        last_error=AutoBackupError(at=_naive_utc(failure.at), message=failure.message) if failure else None,
        backups=[
            SavedBackup(
                name=path.name,
                kind=_kind(path.name),
                created_at=_naive_utc(auto_backup.file_time(path)),
                size_bytes=path.stat().st_size,
            )
            for path in files
        ],
    )


@router.post("/saved/{name}/restore", response_model=RestoreResult)
def restore_saved(name: str, db: Session = Depends(get_db)) -> RestoreResult:
    """Replace everything with a backup from the backup folder, after saving a copy of the current data."""
    path = Path(settings.backup_dir) / name
    if not _SAVED_NAME.match(name) or not path.is_file():
        raise HTTPException(status_code=404, detail="That backup isn’t in the backup folder any more.")
    return _restore_from(path, db)


def _restore_from(path: Path, db: Session) -> RestoreResult:
    try:
        backup = read_backup(path)
    except BackupError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    with auto_backup.backup_lock:
        safety_copy = _write_pre_restore_backup(db)
        restore_backup(db, backup, upload_dir=Path(settings.upload_dir))
    return RestoreResult(created_at=backup.created_at, counts=backup.counts, pre_restore_backup=str(safety_copy))


def _kind(name: str) -> SavedBackupKind:
    for prefix, kind in ((auto_backup.AUTO_PREFIX, "automatic"), ("pre-restore-", "pre-restore"), ("pre-upgrade-", "pre-upgrade")):
        if name.startswith(prefix):
            return kind
    return "other"


def _naive_utc(moment: datetime) -> datetime:
    return moment.astimezone(UTC).replace(tzinfo=None, microsecond=0)


def _write_pre_restore_backup(db: Session) -> Path:
    folder = Path(settings.backup_dir)
    folder.mkdir(parents=True, exist_ok=True)
    out = folder / f"pre-restore-{datetime.now(UTC).astimezone().strftime('%Y%m%d-%H%M%S-%f')}.zip"
    write_backup(db, out, upload_dir=Path(settings.upload_dir))
    for old in sorted(folder.glob("pre-restore-*.zip"))[:-KEEP_PRE_RESTORE_BACKUPS]:
        old.unlink(missing_ok=True)
    return out.resolve()
