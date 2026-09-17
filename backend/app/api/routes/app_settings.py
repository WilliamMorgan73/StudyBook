from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.app_settings import AppSettings
from app.schemas.app_settings import AppSettingsRead, AppSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


def _get_or_create(db: Session) -> AppSettings:
    settings = db.get(AppSettings, 1)
    if settings is None:
        settings = AppSettings(id=1, max_credits=None)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("", response_model=AppSettingsRead)
def get_settings(db: Session = Depends(get_db)) -> AppSettings:
    return _get_or_create(db)


@router.patch("", response_model=AppSettingsRead)
def update_settings(payload: AppSettingsUpdate, db: Session = Depends(get_db)) -> AppSettings:
    settings = _get_or_create(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return settings
