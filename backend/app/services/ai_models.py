"""The AI providers and models StudyBook offers. The one place the lists live: the backend
validates `AppSettings.ai_model` against them and serves them to the frontend's provider and model
pickers (`GET /ai/models`). The selected model decides the provider; there's no separate setting.
"""

from dataclasses import dataclass
from typing import Literal

AIProvider = Literal["anthropic", "gemini"]


@dataclass(frozen=True)
class AIProviderInfo:
    id: AIProvider
    # Who the student pays and sends material to, as shown in the UI ("Anthropic", "Google").
    company: str
    # Rough input cost of one raw PDF page sent as a document, for the size estimate.
    pdf_tokens_per_page: int


@dataclass(frozen=True)
class AIModelOption:
    id: str
    label: str
    description: str
    provider: AIProvider


AI_PROVIDERS: dict[AIProvider, AIProviderInfo] = {
    # Claude reads each page as both text and an image: roughly 1,500-3,000 tokens.
    "anthropic": AIProviderInfo("anthropic", "Anthropic", pdf_tokens_per_page=2_000),
    # Gemini 3 bills a PDF page as one image at its default media resolution (560 tokens).
    "gemini": AIProviderInfo("gemini", "Google", pdf_tokens_per_page=560),
}

# The first model of each provider is that provider's default.
AI_MODELS: tuple[AIModelOption, ...] = (
    AIModelOption(
        "claude-sonnet-5-5", "Claude Sonnet 5.5", "Recommended. Fast and capable, moderate cost.", "anthropic"
    ),
    AIModelOption(
        "claude-opus-5-5", "Claude Opus 5.5", "Most capable for the price, about twice Sonnet's cost.", "anthropic"
    ),
    AIModelOption("claude-haiku-4-5", "Claude Haiku 4.5", "Fastest and cheapest, lower quality.", "anthropic"),
    AIModelOption(
        "gemini-3.8-flash", "Gemini 3.8 Flash", "Recommended. Google's newest model, fast and low cost.", "gemini"
    ),
    AIModelOption(
        "gemini-3.1-pro-preview",
        "Gemini 3.1 Pro (preview)",
        "Strongest on hard material, about twice Flash's cost. No free tier.",
        "gemini",
    ),
    AIModelOption("gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite", "Fastest and cheapest, lower quality.", "gemini"),
)

DEFAULT_AI_MODEL = "claude-sonnet-5-5"

AI_MODEL_IDS = frozenset(m.id for m in AI_MODELS)

_PROVIDER_BY_MODEL: dict[str, AIProvider] = {m.id: m.provider for m in AI_MODELS}


def provider_of(model: str) -> AIProviderInfo:
    """The provider serving `model`. A model no longer listed (retired since it was saved) is
    assumed to be Anthropic's, since every model saved before Gemini support was."""
    return AI_PROVIDERS[_PROVIDER_BY_MODEL.get(model, "anthropic")]
