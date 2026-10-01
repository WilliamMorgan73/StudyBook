from sqlalchemy.orm import Session

from app.models.app_settings import AppSettings


def get_or_create_settings(db: Session) -> AppSettings:
    """The single AppSettings row (id=1), created with defaults on first access."""
    settings = db.get(AppSettings, 1)
    if settings is None:
        settings = AppSettings(id=1, max_credits=None)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings
