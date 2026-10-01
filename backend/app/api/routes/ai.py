from fastapi import APIRouter, Depends

from app.api.deps import get_ai_client
from app.schemas.app_settings import AIConnectionResult, AIModelRead
from app.services.ai import AIClient
from app.services.ai_models import AI_MODELS

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/models", response_model=list[AIModelRead])
def list_models() -> list[AIModelRead]:
    return [AIModelRead(id=m.id, label=m.label, description=m.description, provider=m.provider) for m in AI_MODELS]


@router.post("/test", response_model=AIConnectionResult)
def test_connection(ai: AIClient = Depends(get_ai_client)) -> AIConnectionResult:
    """Checks the saved (or environment) key against the selected model. Failures come back
    as `AIError` responses: `{"detail": <readable message>, "kind": <error kind>}`."""
    ai.ping()
    return AIConnectionResult(ok=True, model=ai.model)
