from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.app_settings import get_or_create_settings
from app.services.ai import AIClient, build_ai_client


def get_ai_client(db: Session = Depends(get_db)) -> AIClient:
    """FastAPI dependency for routes that call Claude. Raises `AIError("not_configured")`
    when no key is saved or set in the environment. Tests override this with a `FakeAIClient`.
    """
    row = get_or_create_settings(db)
    return build_ai_client(row.anthropic_api_key, row.ai_model)
