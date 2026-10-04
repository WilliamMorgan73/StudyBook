from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models.app_settings import AppSettings
from app.models.module import Module


def get_or_create_settings(db: Session) -> AppSettings:
    """The single AppSettings row (id=1), created with defaults on first access.

    A database that already has modules is an existing install, not a first run, so its new row
    starts with setup already completed.
    """
    settings = db.get(AppSettings, 1)
    if settings is None:
        has_modules = db.scalar(select(exists().where(Module.id.isnot(None))))
        settings = AppSettings(id=1, max_credits=None, setup_completed=bool(has_modules))
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings
