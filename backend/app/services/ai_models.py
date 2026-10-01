"""The Claude models StudyBook offers. The one place the list lives: the backend validates
`AppSettings.ai_model` against it and serves it to the frontend's model picker (`GET /ai/models`).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class AIModelOption:
    id: str
    label: str
    description: str


AI_MODELS: tuple[AIModelOption, ...] = (
    AIModelOption("claude-sonnet-5-5", "Claude Sonnet 5.5", "Recommended. Fast and capable, moderate cost."),
    AIModelOption("claude-opus-5-5", "Claude Opus 5.5", "Most capable for the price, about twice Sonnet's cost."),
    AIModelOption("claude-haiku-4-5", "Claude Haiku 4.5", "Fastest and cheapest, lower quality."),
)

DEFAULT_AI_MODEL = "claude-sonnet-5-5"

AI_MODEL_IDS = frozenset(m.id for m in AI_MODELS)
