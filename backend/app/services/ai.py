"""The AI service seam: every call StudyBook makes to Claude goes through an `AIClient`.

Feature functions (flashcard generation, summaries, session guidance) take an `AIClient` as a
parameter and never construct the SDK client themselves. Routes get one from the
`app.api.deps.get_ai_client` dependency; tests pass a `FakeAIClient` (or override that
dependency) so nothing touches the network.

The interface is deliberately small:

- `complete(prompt, system=..., max_tokens=...) -> str` for free text (summaries, guidance).
- `complete_structured(prompt, schema, ...) -> schema instance` for validated JSON
  (card proposals), via the SDK's structured-output support.
- `ping()` cheaply checks that the key and model work (Settings' "Test connection").

Every SDK failure surfaces as an `AIError` with a `kind` and a message a student can act on;
`app.main` turns it into an HTTP error response.
"""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Literal, Protocol, TypeVar

import anthropic
from pydantic import BaseModel

from app.core.config import settings as env_settings

T = TypeVar("T", bound=BaseModel)

AIErrorKind = Literal[
    "not_configured", "auth", "rate_limit", "network", "unavailable", "bad_model", "refusal", "bad_request", "unknown"
]

_HTTP_STATUS: dict[str, int] = {
    "not_configured": 409,
    "auth": 502,
    "rate_limit": 429,
    "network": 503,
    "unavailable": 503,
    "bad_model": 502,
    "refusal": 422,
    "bad_request": 502,
    "unknown": 502,
}

SETTINGS_HINT = "Settings → AI Integration"


class AIError(Exception):
    """A failed AI request, with a message fit to show the student as-is."""

    def __init__(self, kind: AIErrorKind, message: str):
        super().__init__(message)
        self.kind: AIErrorKind = kind
        self.message = message

    @property
    def http_status(self) -> int:
        return _HTTP_STATUS[self.kind]


class AIClient(Protocol):
    model: str

    def ping(self) -> None: ...

    def complete(self, prompt: str, *, system: str | None = None, max_tokens: int = 4096) -> str: ...

    def complete_structured(
        self, prompt: str, schema: type[T], *, system: str | None = None, max_tokens: int = 16000
    ) -> T: ...


def resolve_api_key(saved_key: str | None) -> str | None:
    """The key saved in AppSettings wins; otherwise fall back to the backend environment."""
    for key in (saved_key, env_settings.anthropic_api_key):
        if key and key.strip():
            return key.strip()
    return None


def build_ai_client(saved_key: str | None, model: str) -> "AnthropicAIClient":
    """The one place the real client is constructed. Raises `not_configured` with no key."""
    api_key = resolve_api_key(saved_key)
    if api_key is None:
        raise AIError("not_configured", f"No Anthropic API key is set. Add one in {SETTINGS_HINT}.")
    return AnthropicAIClient(api_key=api_key, model=model)


class AnthropicAIClient:
    """`AIClient` backed by the `anthropic` SDK."""

    def __init__(self, api_key: str, model: str, **client_options):
        # Always pass the key explicitly: with api_key=None the SDK would silently pick up
        # other credentials (env vars, `ant auth` profiles) the student never configured here.
        self.model = model
        self._client = anthropic.Anthropic(api_key=api_key, **client_options)

    def ping(self) -> None:
        # The Models API checks the key and the model ID without spending tokens.
        with _mapped_errors():
            self._client.models.retrieve(self.model)

    def complete(self, prompt: str, *, system: str | None = None, max_tokens: int = 4096) -> str:
        with _mapped_errors():
            response = self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
                **({"system": system} if system else {}),
            )
        _check_refusal(response.stop_reason)
        return "".join(block.text for block in response.content if block.type == "text")

    def complete_structured(
        self, prompt: str, schema: type[T], *, system: str | None = None, max_tokens: int = 16000
    ) -> T:
        with _mapped_errors():
            response = self._client.messages.parse(
                model=self.model,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
                output_format=schema,
                **({"system": system} if system else {}),
            )
        _check_refusal(response.stop_reason)
        if response.parsed_output is None:
            raise AIError("unknown", "Claude's reply couldn't be read. Try again.")
        return response.parsed_output


def _check_refusal(stop_reason: str | None) -> None:
    if stop_reason == "refusal":
        raise AIError("refusal", "Claude declined this request. Try rewording or trimming the content sent.")


@contextmanager
def _mapped_errors() -> Iterator[None]:
    """Translate SDK exceptions into `AIError`s."""
    try:
        yield
    except anthropic.AnthropicError as exc:
        raise _map_sdk_error(exc) from exc


def _map_sdk_error(exc: anthropic.AnthropicError) -> AIError:
    if isinstance(exc, anthropic.AuthenticationError | anthropic.PermissionDeniedError):
        return AIError("auth", f"Anthropic rejected the API key. Check it in {SETTINGS_HINT}.")
    if isinstance(exc, anthropic.RateLimitError):
        return AIError("rate_limit", "Anthropic's rate limit was hit. Wait a minute and try again.")
    if isinstance(exc, anthropic.NotFoundError):
        return AIError("bad_model", f"The selected model isn't available to this key. Pick another in {SETTINGS_HINT}.")
    if isinstance(exc, anthropic.APITimeoutError):
        return AIError("network", "The request to Anthropic timed out. Check your connection and try again.")
    if isinstance(exc, anthropic.APIConnectionError):
        return AIError("network", "Couldn't reach Anthropic. Check your internet connection and try again.")
    if isinstance(exc, anthropic.APIStatusError):
        if exc.status_code >= 500:
            return AIError("unavailable", "Anthropic is overloaded or unavailable right now. Try again shortly.")
        if exc.status_code == 402:
            return AIError("bad_request", "Anthropic refused the request: check your account's credit balance.")
        return AIError("bad_request", f"Anthropic rejected the request: {exc.message}")
    return AIError("unknown", f"The AI request failed: {exc}")


@dataclass
class FakeAIClient:
    """In-memory `AIClient` for tests. Records every request; replies come from the queues
    (or a `respond` callback). Queue an `AIError` to simulate a failure.
    """

    model: str = "fake-model"
    text_replies: list[str | AIError] = field(default_factory=list)
    structured_replies: list[BaseModel | dict | AIError] = field(default_factory=list)
    respond: Callable[[str], str] | None = None
    ping_error: AIError | None = None
    requests: list[dict] = field(default_factory=list)

    def ping(self) -> None:
        self.requests.append({"kind": "ping"})
        if self.ping_error is not None:
            raise self.ping_error

    def complete(self, prompt: str, *, system: str | None = None, max_tokens: int = 4096) -> str:
        self.requests.append({"kind": "complete", "prompt": prompt, "system": system, "max_tokens": max_tokens})
        if self.text_replies:
            reply = self.text_replies.pop(0)
            if isinstance(reply, AIError):
                raise reply
            return reply
        if self.respond is not None:
            return self.respond(prompt)
        return ""

    def complete_structured(
        self, prompt: str, schema: type[T], *, system: str | None = None, max_tokens: int = 16000
    ) -> T:
        self.requests.append(
            {"kind": "structured", "prompt": prompt, "system": system, "schema": schema, "max_tokens": max_tokens}
        )
        if not self.structured_replies:
            raise AssertionError("FakeAIClient has no structured reply queued")
        reply = self.structured_replies.pop(0)
        if isinstance(reply, AIError):
            raise reply
        # Validate through the schema, as the real client does, so malformed fixtures fail loudly.
        return schema.model_validate(reply.model_dump() if isinstance(reply, BaseModel) else reply)
