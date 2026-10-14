from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.app_settings import get_or_create_settings
from app.schemas.app_settings import AppSettingsRead, AppSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=AppSettingsRead)
def get_settings(db: Session = Depends(get_db)) -> AppSettingsRead:
    return AppSettingsRead.from_row(get_or_create_settings(db))


@router.patch("", response_model=AppSettingsRead)
def update_settings(payload: AppSettingsUpdate, db: Session = Depends(get_db)) -> AppSettingsRead:
    settings = get_or_create_settings(db)
    changes = payload.model_dump(exclude_unset=True)
    not_nullable = ("ai_model", "setup_completed", "auto_backup_enabled", "auto_backup_interval_days", "auto_backup_keep")
    for field in not_nullable:  # not nullable: null means "leave it"
        if changes.get(field, "") is None:
            del changes[field]
    for field, value in changes.items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return AppSettingsRead.from_row(settings)
