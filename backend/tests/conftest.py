import os

# Before anything imports `app.core.config`: the app's module-level engine must never point at a developer's
# real database (a `.env` DATABASE_URL), even though tests use their own engines.
os.environ["DATABASE_URL"] = "sqlite://"

import pytest

from app.services import ai


@pytest.fixture(autouse=True)
def no_env_api_keys(monkeypatch):
    """Tests must not see a developer's real ANTHROPIC_API_KEY / GEMINI_API_KEY (from the shell or .env)."""
    monkeypatch.setattr(ai.env_settings, "anthropic_api_key", None)
    monkeypatch.setattr(ai.env_settings, "gemini_api_key", None)
