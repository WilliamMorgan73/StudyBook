import pytest

from app.services import ai


@pytest.fixture(autouse=True)
def no_env_api_keys(monkeypatch):
    """Tests must not see a developer's real ANTHROPIC_API_KEY / GEMINI_API_KEY (from the shell or .env)."""
    monkeypatch.setattr(ai.env_settings, "anthropic_api_key", None)
    monkeypatch.setattr(ai.env_settings, "gemini_api_key", None)
