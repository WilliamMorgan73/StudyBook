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


@pytest.fixture(autouse=True)
def scratch_undo_dir(tmp_path_factory, monkeypatch):
    """Deletes keep undo copies on disk; never in the developer's data folder."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "undo_dir", str(tmp_path_factory.mktemp("undo")))
