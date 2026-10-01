"""The AI service seam: every call StudyBook makes to an AI model goes through an `AIClient`,
backed by Anthropic (`AnthropicAIClient`) or Google Gemini (`GeminiAIClient`). The selected model
picks the provider (`ai_models.provider_of`); each provider has its own saved key.

Feature functions (flashcard generation, summaries, session guidance) take an `AIClient` as a
parameter and never construct the SDK client themselves. Routes get one from the
`app.api.deps.get_ai_client` dependency; tests pass a `FakeAIClient` (or override that
dependency) so nothing touches the network.

The interface is deliberately small:

- `complete(prompt, system=..., max_tokens=...) -> str` for free text (summaries, guidance).
- `complete_structured(prompt, schema, ...) -> schema instance` for validated JSON
  (card proposals), via each SDK's structured-output support. A reply that doesn't fit the
  schema raises `AIError("unknown")`, never a raw validation error.
- Both take optional `documents` (`AIDocument`: raw PDF bytes), sent ahead of the prompt. Only
  used once the student has confirmed sending an original PDF (see `submodule_source`).
- `ping()` cheaply checks that the key and model work (Settings' "Test connection").

Every SDK failure surfaces as an `AIError` with a `kind` and a message a student can act on;
`app.main` turns it into an HTTP error response.
"""

import base64
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Literal, Protocol, TypeVar

import anthropic
import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import BaseModel, ValidationError

from app.core.config import settings as env_settings
from app.services.ai_models import AIProvider, provider_of

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

UNREADABLE_REPLY = "The AI's reply couldn't be read. Try again."


class AIError(Exception):
    """A failed AI request, with a message fit to show the student as-is."""

    def __init__(self, kind: AIErrorKind, message: str):
        super().__init__(message)
        self.kind: AIErrorKind = kind
        self.message = message

    @property
    def http_status(self) -> int:
        return _HTTP_STATUS[self.kind]


@dataclass(frozen=True)
class AIDocument:
    """A raw PDF sent alongside the prompt as a document block."""

    title: str
    data: bytes


class AIClient(Protocol):
    model: str

    def ping(self) -> None: ...

    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        max_tokens: int = 4096,
        documents: Sequence[AIDocument] = (),
    ) -> str: ...

    def complete_structured(
        self,
        prompt: str,
        schema: type[T],
        *,
        system: str | None = None,
        max_tokens: int = 16000,
        documents: Sequence[AIDocument] = (),
    ) -> T: ...


def resolve_api_key(provider: AIProvider, saved_key: str | None) -> str | None:
    """The provider's key saved in AppSettings wins; otherwise fall back to the backend environment
    (`ANTHROPIC_API_KEY` / `GEMINI_API_KEY`)."""
    env_key = env_settings.anthropic_api_key if provider == "anthropic" else env_settings.gemini_api_key
    for key in (saved_key, env_key):
        if key and key.strip():
            return key.strip()
    return None


def build_ai_client(model: str, *, anthropic_api_key: str | None, gemini_api_key: str | None) -> AIClient:
    """The one place a real client is constructed, for the provider serving `model`, given the
    saved keys. Raises `not_configured` when that provider has no key."""
    provider = provider_of(model)
    saved_key = anthropic_api_key if provider.id == "anthropic" else gemini_api_key
    api_key = resolve_api_key(provider.id, saved_key)
    if api_key is None:
        name = "Anthropic" if provider.id == "anthropic" else "Gemini"
        raise AIError("not_configured", f"No {name} API key is set. Add one in {SETTINGS_HINT}.")
    if provider.id == "gemini":
        return GeminiAIClient(api_key=api_key, model=model)
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

    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        max_tokens: int = 4096,
        documents: Sequence[AIDocument] = (),
    ) -> str:
        with _mapped_errors():
            response = self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": _user_content(prompt, documents)}],
                **({"system": system} if system else {}),
            )
        _check_refusal(response.stop_reason)
        return "".join(block.text for block in response.content if block.type == "text")

    def complete_structured(
        self,
        prompt: str,
        schema: type[T],
        *,
        system: str | None = None,
        max_tokens: int = 16000,
        documents: Sequence[AIDocument] = (),
    ) -> T:
        with _mapped_errors():
            try:
                response = self._client.messages.parse(
                    model=self.model,
                    max_tokens=max_tokens,
                    messages=[{"role": "user", "content": _user_content(prompt, documents)}],
                    output_format=schema,
                    **({"system": system} if system else {}),
                )
            except ValidationError as exc:
                # The reply wasn't valid for the schema (e.g. cut off at max_tokens).
                raise AIError("unknown", UNREADABLE_REPLY) from exc
        _check_refusal(response.stop_reason)
        if response.parsed_output is None:
            raise AIError("unknown", UNREADABLE_REPLY)
        return response.parsed_output


def _user_content(prompt: str, documents: Sequence[AIDocument]) -> str | list[dict]:
    """The prompt as-is, or PDF document blocks first and the prompt last when any are attached."""
    if not documents:
        return prompt
    blocks: list[dict] = [
        {
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": "application/pdf",
                "data": base64.standard_b64encode(doc.data).decode("ascii"),
            },
            "title": doc.title,
        }
        for doc in documents
    ]
    blocks.append({"type": "text", "text": prompt})
    return blocks


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


# Gemini 3 models always think, and thinking counts against `max_output_tokens`. Callers size
# `max_tokens` for the answer alone (as Claude counts it), so Gemini gets this much on top.
# Unused allowance costs nothing.
GEMINI_THINKING_ALLOWANCE = 16_000

# Finish reasons meaning Gemini withheld the reply over its content policies.
_GEMINI_BLOCKED = frozenset(
    {
        genai_types.FinishReason.SAFETY,
        genai_types.FinishReason.PROHIBITED_CONTENT,
        genai_types.FinishReason.BLOCKLIST,
        genai_types.FinishReason.SPII,
        genai_types.FinishReason.RECITATION,
    }
)


class GeminiAIClient:
    """`AIClient` backed by the `google-genai` SDK (Gemini Developer API, not Vertex AI)."""

    def __init__(self, api_key: str, model: str, http_options: genai_types.HttpOptions | None = None):
        # Pass the key and `vertexai=False` explicitly so stray GOOGLE_* env vars can't redirect it.
        self.model = model
        self._client = genai.Client(api_key=api_key, vertexai=False, http_options=http_options)

    def ping(self) -> None:
        # Looking the model up checks the key and the model ID without spending tokens.
        with _gemini_errors():
            self._client.models.get(model=self.model)

    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        max_tokens: int = 4096,
        documents: Sequence[AIDocument] = (),
    ) -> str:
        response = self._generate(prompt, system, max_tokens, documents)
        return response.text or ""

    def complete_structured(
        self,
        prompt: str,
        schema: type[T],
        *,
        system: str | None = None,
        max_tokens: int = 16000,
        documents: Sequence[AIDocument] = (),
    ) -> T:
        response = self._generate(
            prompt,
            system,
            max_tokens,
            documents,
            response_mime_type="application/json",
            response_json_schema=schema.model_json_schema(),
        )
        try:
            return schema.model_validate_json(response.text or "")
        except ValidationError as exc:
            # Not valid for the schema (e.g. cut off at the token limit).
            raise AIError("unknown", UNREADABLE_REPLY) from exc

    def _generate(
        self, prompt: str, system: str | None, max_tokens: int, documents: Sequence[AIDocument], **config
    ) -> genai_types.GenerateContentResponse:
        contents: list = [genai_types.Part.from_bytes(data=doc.data, mime_type="application/pdf") for doc in documents]
        contents.append(prompt)
        with _gemini_errors():
            response = self._client.models.generate_content(
                model=self.model,
                contents=contents,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system,
                    max_output_tokens=max_tokens + GEMINI_THINKING_ALLOWANCE,
                    automatic_function_calling=genai_types.AutomaticFunctionCallingConfig(disable=True),
                    **config,
                ),
            )
        _check_gemini_blocked(response)
        return response


def _check_gemini_blocked(response: genai_types.GenerateContentResponse) -> None:
    feedback = response.prompt_feedback
    finish = response.candidates[0].finish_reason if response.candidates else None
    if (feedback is not None and feedback.block_reason is not None) or finish in _GEMINI_BLOCKED:
        raise AIError("refusal", "Gemini declined this request. Try rewording or trimming the content sent.")
    if not response.candidates:
        raise AIError("unknown", UNREADABLE_REPLY)


@contextmanager
def _gemini_errors() -> Iterator[None]:
    """Translate google-genai failures into `AIError`s. Connection failures surface as raw httpx
    errors (the SDK doesn't wrap them)."""
    try:
        yield
    except httpx.TimeoutException as exc:
        raise AIError("network", "The request to Google timed out. Check your connection and try again.") from exc
    except httpx.TransportError as exc:
        raise AIError("network", "Couldn't reach Google. Check your internet connection and try again.") from exc
    except genai_errors.APIError as exc:
        raise _map_gemini_error(exc) from exc


def _map_gemini_error(exc: genai_errors.APIError) -> AIError:
    message = exc.message or exc.status or "unknown error"
    # An invalid key comes back as 400 INVALID_ARGUMENT with reason API_KEY_INVALID.
    if exc.code in (401, 403) or "API_KEY_INVALID" in str(exc.details) or "API key not valid" in message:
        return AIError("auth", f"Google rejected the Gemini API key. Check it in {SETTINGS_HINT}.")
    if exc.code == 429:
        return AIError(
            "rate_limit", "Gemini's rate limit or quota was hit. Wait a minute, or check your plan, and try again."
        )
    if exc.code == 404:
        return AIError("bad_model", f"The selected model isn't available to this key. Pick another in {SETTINGS_HINT}.")
    if exc.code >= 500:
        return AIError("unavailable", "Gemini is overloaded or unavailable right now. Try again shortly.")
    return AIError("bad_request", f"Google rejected the request: {message}")


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

    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        max_tokens: int = 4096,
        documents: Sequence[AIDocument] = (),
    ) -> str:
        self.requests.append(
            {
                "kind": "complete",
                "prompt": prompt,
                "system": system,
                "max_tokens": max_tokens,
                "documents": list(documents),
            }
        )
        if self.text_replies:
            reply = self.text_replies.pop(0)
            if isinstance(reply, AIError):
                raise reply
            return reply
        if self.respond is not None:
            return self.respond(prompt)
        return ""

    def complete_structured(
        self,
        prompt: str,
        schema: type[T],
        *,
        system: str | None = None,
        max_tokens: int = 16000,
        documents: Sequence[AIDocument] = (),
    ) -> T:
        self.requests.append(
            {
                "kind": "structured",
                "prompt": prompt,
                "system": system,
                "schema": schema,
                "max_tokens": max_tokens,
                "documents": list(documents),
            }
        )
        if not self.structured_replies:
            raise AssertionError("FakeAIClient has no structured reply queued")
        reply = self.structured_replies.pop(0)
        if isinstance(reply, AIError):
            raise reply
        # Validate through the schema, as the real client does: a malformed reply is an AIError.
        try:
            return schema.model_validate(reply.model_dump() if isinstance(reply, BaseModel) else reply)
        except ValidationError as exc:
            raise AIError("unknown", UNREADABLE_REPLY) from exc
