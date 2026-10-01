"""AI settings endpoints, against a throwaway in-memory SQLite database holding only the
app_settings table (never the dev Postgres), with the AI client faked."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # registers relationship string refs (the name `app` is rebound below)
from app.api.deps import get_ai_client
from app.core.database import get_db
from app.main import app
from app.models.app_settings import AppSettings
from app.services import ai
from app.services.ai import AIError, FakeAIClient
from app.services.ai_models import AI_MODEL_IDS, DEFAULT_AI_MODEL

SECRET = "sk-ant-test-0123456789abcdef"
GEMINI_SECRET = "AIza-test-0123456789abcdef"


@pytest.fixture
def db() -> Iterator[Session]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    AppSettings.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def assert_secret_absent(response) -> None:
    for secret in (SECRET, GEMINI_SECRET):
        assert secret not in response.text
    assert "anthropic_api_key" not in response.json()
    assert "gemini_api_key" not in response.json()


def test_defaults_report_no_key_and_current_sonnet(client):
    body = client.get("/settings").json()

    assert body["has_anthropic_api_key"] is False
    assert body["has_gemini_api_key"] is False
    assert body["ai_enabled"] is False
    assert body["ai_model"] == DEFAULT_AI_MODEL == "claude-sonnet-5-5"
    assert body["ai_provider"] == "anthropic"
    assert DEFAULT_AI_MODEL in AI_MODEL_IDS


def test_saved_key_is_never_returned(client, db):
    patched = client.patch("/settings", json={"anthropic_api_key": SECRET})
    fetched = client.get("/settings")

    for response in (patched, fetched):
        assert response.status_code == 200
        assert_secret_absent(response)
        assert response.json()["has_anthropic_api_key"] is True
        assert response.json()["ai_enabled"] is True
    assert db.get(AppSettings, 1).anthropic_api_key == SECRET


def test_unrelated_patch_leaves_key_alone(client, db):
    client.patch("/settings", json={"anthropic_api_key": SECRET})

    response = client.patch("/settings", json={"theme_mode": "dark"})

    assert response.json()["has_anthropic_api_key"] is True
    assert db.get(AppSettings, 1).anthropic_api_key == SECRET


@pytest.mark.parametrize("cleared", [None, "", "   "])
def test_key_can_be_cleared(client, db, cleared):
    client.patch("/settings", json={"anthropic_api_key": SECRET})

    body = client.patch("/settings", json={"anthropic_api_key": cleared}).json()

    assert body["has_anthropic_api_key"] is False
    assert body["ai_enabled"] is False
    assert db.get(AppSettings, 1).anthropic_api_key is None


def test_key_is_trimmed(client, db):
    client.patch("/settings", json={"anthropic_api_key": f"  {SECRET}\n"})

    assert db.get(AppSettings, 1).anthropic_api_key == SECRET


def test_env_key_enables_ai_without_a_saved_key(client, monkeypatch):
    monkeypatch.setattr(ai.env_settings, "anthropic_api_key", "sk-ant-from-env")

    body = client.get("/settings").json()

    assert body["has_anthropic_api_key"] is False
    assert body["ai_enabled"] is True
    assert "sk-ant-from-env" not in client.get("/settings").text


def test_saved_key_wins_over_env_key(monkeypatch):
    monkeypatch.setattr(ai.env_settings, "anthropic_api_key", "sk-ant-from-env")

    assert ai.resolve_api_key("anthropic", SECRET) == SECRET
    assert ai.resolve_api_key("anthropic", None) == "sk-ant-from-env"
    assert ai.resolve_api_key("anthropic", "") == "sk-ant-from-env"
    # Each provider only falls back to its own environment key.
    assert ai.resolve_api_key("gemini", None) is None


def test_build_ai_client_uses_env_fallback(monkeypatch):
    monkeypatch.setattr(ai.env_settings, "anthropic_api_key", "sk-ant-from-env")

    client = ai.build_ai_client("claude-opus-5-5", anthropic_api_key=None, gemini_api_key=None)

    assert isinstance(client, ai.AnthropicAIClient)
    assert client.model == "claude-opus-5-5"
    assert client._client.api_key == "sk-ant-from-env"


def test_build_ai_client_without_any_key_is_not_configured():
    with pytest.raises(AIError) as excinfo:
        ai.build_ai_client(DEFAULT_AI_MODEL, anthropic_api_key=None, gemini_api_key=None)

    assert excinfo.value.kind == "not_configured"


def test_build_ai_client_picks_the_provider_from_the_model(monkeypatch):
    monkeypatch.setattr(ai.env_settings, "gemini_api_key", "AIza-from-env")

    gemini = ai.build_ai_client("gemini-3.8-flash", anthropic_api_key=SECRET, gemini_api_key=GEMINI_SECRET)
    from_env = ai.build_ai_client("gemini-3.8-flash", anthropic_api_key=SECRET, gemini_api_key=None)

    assert isinstance(gemini, ai.GeminiAIClient)
    assert gemini.model == "gemini-3.8-flash"
    assert gemini._client._api_client.api_key == GEMINI_SECRET
    assert from_env._client._api_client.api_key == "AIza-from-env"


def test_gemini_model_without_a_gemini_key_is_not_configured():
    # A saved Anthropic key doesn't count for a Gemini model.
    with pytest.raises(AIError) as excinfo:
        ai.build_ai_client("gemini-3.8-flash", anthropic_api_key=SECRET, gemini_api_key=None)

    assert excinfo.value.kind == "not_configured"
    assert "Gemini" in excinfo.value.message


def test_both_keys_are_kept_and_ai_enabled_follows_the_selected_provider(client, db):
    client.patch("/settings", json={"anthropic_api_key": SECRET})

    gemini_no_key = client.patch("/settings", json={"ai_model": "gemini-3.8-flash"}).json()
    gemini_keyed = client.patch("/settings", json={"gemini_api_key": f" {GEMINI_SECRET} "})
    back_to_claude = client.patch("/settings", json={"ai_model": "claude-haiku-4-5"}).json()

    assert gemini_no_key["ai_provider"] == "gemini"
    assert gemini_no_key["ai_enabled"] is False
    assert gemini_keyed.json()["ai_enabled"] is True
    assert gemini_keyed.json()["has_anthropic_api_key"] is True
    assert gemini_keyed.json()["has_gemini_api_key"] is True
    assert_secret_absent(gemini_keyed)
    assert back_to_claude["ai_provider"] == "anthropic"
    assert back_to_claude["ai_enabled"] is True
    row = db.get(AppSettings, 1)
    assert (row.anthropic_api_key, row.gemini_api_key) == (SECRET, GEMINI_SECRET)


def test_gemini_key_can_be_cleared_without_touching_the_anthropic_key(client, db):
    client.patch("/settings", json={"anthropic_api_key": SECRET, "gemini_api_key": GEMINI_SECRET})

    body = client.patch("/settings", json={"gemini_api_key": None}).json()

    assert body["has_gemini_api_key"] is False
    assert body["has_anthropic_api_key"] is True
    assert db.get(AppSettings, 1).gemini_api_key is None


def test_model_can_be_changed_but_must_be_known(client):
    assert client.patch("/settings", json={"ai_model": "claude-opus-5-5"}).json()["ai_model"] == "claude-opus-5-5"
    assert client.patch("/settings", json={"ai_model": "gpt-5"}).status_code == 422
    # An explicit null is ignored rather than violating the NOT NULL column.
    assert client.patch("/settings", json={"ai_model": None}).json()["ai_model"] == "claude-opus-5-5"


def test_models_endpoint_lists_the_model_options(client):
    models = client.get("/ai/models").json()

    assert {m["id"] for m in models} == AI_MODEL_IDS
    assert models[0]["id"] == DEFAULT_AI_MODEL
    assert {m["provider"] for m in models} == {"anthropic", "gemini"}


def test_test_connection_without_key_is_not_configured(client):
    response = client.post("/ai/test")

    assert response.status_code == 409
    assert response.json()["kind"] == "not_configured"
    assert "Settings" in response.json()["detail"]


def test_test_connection_succeeds_with_fake_client(client):
    fake = FakeAIClient(model="claude-sonnet-5-5")
    app.dependency_overrides[get_ai_client] = lambda: fake

    response = client.post("/ai/test")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "model": "claude-sonnet-5-5"}
    assert fake.requests == [{"kind": "ping"}]


@pytest.mark.parametrize(
    ("kind", "status"),
    [("auth", 502), ("rate_limit", 429), ("network", 503), ("bad_model", 502)],
)
def test_test_connection_reports_readable_errors(client, kind, status):
    fake = FakeAIClient(ping_error=AIError(kind, f"readable {kind} message"))
    app.dependency_overrides[get_ai_client] = lambda: fake

    response = client.post("/ai/test")

    assert response.status_code == status
    assert response.json() == {"detail": f"readable {kind} message", "kind": kind}


def test_test_connection_uses_saved_key_and_model(client, monkeypatch):
    built = {}

    def fake_build(model, *, anthropic_api_key, gemini_api_key):
        built.update(model=model, anthropic_api_key=anthropic_api_key, gemini_api_key=gemini_api_key)
        return FakeAIClient(model=model)

    monkeypatch.setattr("app.api.deps.build_ai_client", fake_build)
    client.patch(
        "/settings",
        json={"anthropic_api_key": SECRET, "gemini_api_key": GEMINI_SECRET, "ai_model": "gemini-3.5-flash-lite"},
    )

    response = client.post("/ai/test")

    assert response.json() == {"ok": True, "model": "gemini-3.5-flash-lite"}
    assert built == {"model": "gemini-3.5-flash-lite", "anthropic_api_key": SECRET, "gemini_api_key": GEMINI_SECRET}
