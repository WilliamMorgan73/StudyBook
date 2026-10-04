import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.core.clock import local_now
from app.core.config import settings
from app.core.database import get_db
from app.services.backup import BackupError, read_backup, restore_backup, write_backup

router = APIRouter(prefix="/backup", tags=["backup"])

# Automatic pre-restore copies kept in `settings.backup_dir`; older ones are deleted.
KEEP_PRE_RESTORE_BACKUPS = 3


class RestoreResult(BaseModel):
    created_at: str
    counts: dict[str, int]
    pre_restore_backup: str


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
        try:
            backup = read_backup(uploaded)
        except BackupError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        safety_copy = _write_pre_restore_backup(db)
        restore_backup(db, backup, upload_dir=Path(settings.upload_dir))
        return RestoreResult(created_at=backup.created_at, counts=backup.counts, pre_restore_backup=str(safety_copy))
    finally:
        uploaded.unlink(missing_ok=True)


def _write_pre_restore_backup(db: Session) -> Path:
    folder = Path(settings.backup_dir)
    folder.mkdir(parents=True, exist_ok=True)
    out = folder / f"pre-restore-{datetime.now(UTC).astimezone().strftime('%Y%m%d-%H%M%S-%f')}.zip"
    write_backup(db, out, upload_dir=Path(settings.upload_dir))
    for old in sorted(folder.glob("pre-restore-*.zip"))[:-KEEP_PRE_RESTORE_BACKUPS]:
        old.unlink(missing_ok=True)
    return out.resolve()
