"""The real `AnthropicAIClient` against a mocked HTTP transport (no network): requests are
shaped as expected and SDK failures become readable `AIError`s."""

import json

import httpx2
import pytest
from pydantic import BaseModel

from app.services.ai import AIDocument, AIError, AnthropicAIClient, FakeAIClient


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
