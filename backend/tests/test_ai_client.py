"""The real `AnthropicAIClient` and `GeminiAIClient` against mocked HTTP transports (no network): requests are
shaped as expected and SDK failures become readable `AIError`s."""

import json

import httpx
import httpx2
import pytest
from google.genai import types as genai_types
from pydantic import BaseModel

from app.services.ai import (
    GEMINI_THINKING_ALLOWANCE,
    AIDocument,
    AIError,
    AnthropicAIClient,
    FakeAIClient,
    GeminiAIClient,
)


def make_client(handler) -> AnthropicAIClient:
    return AnthropicAIClient(
        api_key="sk-ant-test",
        model="claude-sonnet-5-5",
        http_client=httpx2.Client(transport=httpx2.MockTransport(handler)),
        max_retries=0,
    )


def message_body(content: list[dict], stop_reason: str = "end_turn") -> dict:
    return {
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "model": "claude-sonnet-5-5",
        "content": content,
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": 10, "output_tokens": 5},
    }


def error_response(status: int, error_type: str) -> httpx2.Response:
    return httpx2.Response(status, json={"type": "error", "error": {"type": error_type, "message": "nope"}})


def test_ping_retrieves_the_selected_model_with_the_key():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx2.Response(
            200,
            json={
                "type": "model",
                "id": "claude-sonnet-5-5",
                "display_name": "Claude Sonnet 5.5",
                "created_at": "2026-01-01T00:00:00Z",
            },
        )

    make_client(handler).ping()

    assert seen[0].url.path == "/v1/models/claude-sonnet-5-5"
    assert seen[0].headers["x-api-key"] == "sk-ant-test"


def test_complete_sends_prompt_and_system_and_joins_text():
    sent = {}

    def handler(request):
        sent.update(json.loads(request.content))
        return httpx2.Response(200, json=message_body([{"type": "text", "text": "Hello"}, {"type": "text", "text": "!"}]))

    reply = make_client(handler).complete("Say hi", system="Be brief", max_tokens=100)

    assert reply == "Hello!"
    assert sent["model"] == "claude-sonnet-5-5"
    assert sent["system"] == "Be brief"
    assert sent["max_tokens"] == 100
    assert sent["messages"] == [{"role": "user", "content": "Say hi"}]


class Card(BaseModel):
    front: str
    back: str


def test_complete_structured_returns_a_validated_instance():
    def handler(request):
        return httpx2.Response(200, json=message_body([{"type": "text", "text": '{"front": "Q", "back": "A"}'}]))

    assert make_client(handler).complete_structured("Make a card", Card) == Card(front="Q", back="A")


@pytest.mark.parametrize("text", ['{"front": "Q"}', '{"front": "Q", "ba'])
def test_complete_structured_reports_a_reply_that_does_not_fit_the_schema(text):
    def handler(request):
        return httpx2.Response(200, json=message_body([{"type": "text", "text": text}]))

    with pytest.raises(AIError) as excinfo:
        make_client(handler).complete_structured("Make a card", Card)

    assert excinfo.value.kind == "unknown"


def test_documents_are_sent_as_pdf_blocks_before_the_prompt():
    sent = {}

    def handler(request):
        sent.update(json.loads(request.content))
        return httpx2.Response(200, json=message_body([{"type": "text", "text": "ok"}]))

    make_client(handler).complete("Summarise", documents=[AIDocument(title="slides.pdf", data=b"%PDF-1.4")])

    content = sent["messages"][0]["content"]
    assert content[0]["type"] == "document"
    assert content[0]["title"] == "slides.pdf"
    assert content[0]["source"] == {"type": "base64", "media_type": "application/pdf", "data": "JVBERi0xLjQ="}
    assert content[1] == {"type": "text", "text": "Summarise"}


def test_refusal_is_reported():
    def handler(request):
        return httpx2.Response(200, json=message_body([], stop_reason="refusal"))

    with pytest.raises(AIError) as excinfo:
        make_client(handler).complete("x")

    assert excinfo.value.kind == "refusal"


@pytest.mark.parametrize(
    ("status", "error_type", "kind"),
    [
        (401, "authentication_error", "auth"),
        (403, "permission_error", "auth"),
        (429, "rate_limit_error", "rate_limit"),
        (404, "not_found_error", "bad_model"),
        (529, "overloaded_error", "unavailable"),
        (500, "api_error", "unavailable"),
        (400, "invalid_request_error", "bad_request"),
    ],
)
def test_http_errors_map_to_readable_kinds(status, error_type, kind):
    client = make_client(lambda request: error_response(status, error_type))

    with pytest.raises(AIError) as excinfo:
        client.ping()

    assert excinfo.value.kind == kind
    assert excinfo.value.message


def test_network_failure_maps_to_network():
    def handler(request):
        raise httpx2.ConnectError("no route to host", request=request)

    with pytest.raises(AIError) as excinfo:
        make_client(handler).complete("x")

    assert excinfo.value.kind == "network"


def test_fake_client_records_requests_and_validates_replies():
    fake = FakeAIClient(text_replies=["summary"], structured_replies=[{"front": "Q", "back": "A"}, {"front": "Q"}])

    assert fake.complete("notes", system="sys") == "summary"
    assert fake.complete_structured("p", Card) == Card(front="Q", back="A")
    with pytest.raises(AIError):
        fake.complete_structured("p", Card)  # malformed reply fails validation, as the real client would

    assert [r["kind"] for r in fake.requests] == ["complete", "structured", "structured"]
    assert fake.requests[0]["prompt"] == "notes"


def test_fake_client_can_raise_queued_errors():
    fake = FakeAIClient(text_replies=[AIError("rate_limit", "slow down")])

    with pytest.raises(AIError) as excinfo:
        fake.complete("x")

    assert excinfo.value.kind == "rate_limit"


# --- GeminiAIClient (google-genai uses plain httpx, not httpx2) ---


def make_gemini_client(handler) -> GeminiAIClient:
    return GeminiAIClient(
        api_key="AIza-test",
        model="gemini-3.8-flash",
        http_options=genai_types.HttpOptions(httpx_client=httpx.Client(transport=httpx.MockTransport(handler))),
    )


def gemini_body(text: str | None, finish_reason: str = "STOP", **extra) -> dict:
    parts = [] if text is None else [{"text": text}]
    return {"candidates": [{"content": {"role": "model", "parts": parts}, "finishReason": finish_reason}], **extra}


def gemini_error(status: int, grpc_status: str, message: str = "nope", details: list | None = None) -> httpx.Response:
    error = {"code": status, "message": message, "status": grpc_status}
    if details is not None:
        error["details"] = details
    return httpx.Response(status, json={"error": error})


def test_gemini_ping_looks_up_the_selected_model_with_the_key():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={"name": "models/gemini-3.8-flash"})

    make_gemini_client(handler).ping()

    assert seen[0].method == "GET"
    assert seen[0].url.path.endswith("/models/gemini-3.8-flash")
    assert seen[0].headers["x-goog-api-key"] == "AIza-test"


def test_gemini_complete_sends_prompt_system_and_a_thinking_allowance():
    sent = {}

    def handler(request):
        sent.update(json.loads(request.content))
        return httpx.Response(200, json=gemini_body("Hello!"))

    reply = make_gemini_client(handler).complete("Say hi", system="Be brief", max_tokens=100)

    assert reply == "Hello!"
    assert sent["contents"] == [{"role": "user", "parts": [{"text": "Say hi"}]}]
    assert sent["systemInstruction"]["parts"] == [{"text": "Be brief"}]
    assert sent["generationConfig"]["maxOutputTokens"] == 100 + GEMINI_THINKING_ALLOWANCE


def test_gemini_complete_structured_sends_the_schema_and_validates_the_reply():
    sent = {}

    def handler(request):
        sent.update(json.loads(request.content))
        return httpx.Response(200, json=gemini_body('{"front": "Q", "back": "A"}'))

    card = make_gemini_client(handler).complete_structured("Make a card", Card)

    assert card == Card(front="Q", back="A")
    assert sent["generationConfig"]["responseMimeType"] == "application/json"
    assert sent["generationConfig"]["responseJsonSchema"] == Card.model_json_schema()


@pytest.mark.parametrize("text", ['{"front": "Q"}', '{"front": "Q", "ba', None])
def test_gemini_reply_that_does_not_fit_the_schema_is_unknown(text):
    client = make_gemini_client(lambda request: httpx.Response(200, json=gemini_body(text, "MAX_TOKENS")))

    with pytest.raises(AIError) as excinfo:
        client.complete_structured("Make a card", Card)

    assert excinfo.value.kind == "unknown"


def test_gemini_documents_are_sent_inline_before_the_prompt():
    sent = {}

    def handler(request):
        sent.update(json.loads(request.content))
        return httpx.Response(200, json=gemini_body("ok"))

    make_gemini_client(handler).complete("Summarise", documents=[AIDocument(title="slides.pdf", data=b"%PDF-1.4")])

    parts = sent["contents"][0]["parts"]
    assert parts[0]["inlineData"]["data"] == "JVBERi0xLjQ="
    assert "application/pdf" in parts[0]["inlineData"].values()
    assert parts[1] == {"text": "Summarise"}


@pytest.mark.parametrize(
    "body",
    [
        gemini_body(None, "SAFETY"),
        gemini_body(None, "PROHIBITED_CONTENT"),
        {"promptFeedback": {"blockReason": "SAFETY"}},
    ],
)
def test_gemini_blocked_replies_are_refusals(body):
    client = make_gemini_client(lambda request: httpx.Response(200, json=body))

    with pytest.raises(AIError) as excinfo:
        client.complete("x")

    assert excinfo.value.kind == "refusal"


@pytest.mark.parametrize(
    ("response", "kind"),
    [
        (
            gemini_error(
                400,
                "INVALID_ARGUMENT",
                "API key not valid. Please pass a valid API key.",
                [{"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": "API_KEY_INVALID"}],
            ),
            "auth",
        ),
        (gemini_error(403, "PERMISSION_DENIED"), "auth"),
        (gemini_error(429, "RESOURCE_EXHAUSTED"), "rate_limit"),
        (gemini_error(404, "NOT_FOUND"), "bad_model"),
        (gemini_error(503, "UNAVAILABLE"), "unavailable"),
        (gemini_error(400, "INVALID_ARGUMENT", "Request too large"), "bad_request"),
    ],
)
def test_gemini_http_errors_map_to_readable_kinds(response, kind):
    client = make_gemini_client(lambda request: response)

    with pytest.raises(AIError) as excinfo:
        client.ping()

    assert excinfo.value.kind == kind
    assert excinfo.value.message


@pytest.mark.parametrize("error", [httpx.ConnectError, httpx.ReadTimeout])
def test_gemini_network_failure_maps_to_network(error):
    def handler(request):
        raise error("no route to host", request=request)

    with pytest.raises(AIError) as excinfo:
        make_gemini_client(handler).complete("x")

    assert excinfo.value.kind == "network"
