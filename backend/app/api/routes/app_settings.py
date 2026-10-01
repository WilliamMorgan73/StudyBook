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
    if changes.get("ai_model", "") is None:
        del changes["ai_model"]
    for field, value in changes.items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return AppSettingsRead.from_row(settings)
