"""AI flashcard generation: proposes front/back cards from a Submodule's source material.

`generate_flashcards` only returns proposals; nothing is saved. The student reviews them in the
frontend and accepted ones go through the normal `POST /flashcards` with `source="ai"`.

The reply is structured output (`CardProposals`), then cleaned by `clean_proposals`: blank cards
and repeats of existing fronts are dropped, and an over-long reply is cut to the requested count.
"""

import re
from collections.abc import Callable, Iterable
from pathlib import Path

from pydantic import BaseModel, Field

from app.services.ai import AIClient
from app.services.submodule_source import SubmoduleSource

DEFAULT_CARD_COUNT = 10
MAX_CARD_COUNT = 30

SYSTEM_PROMPT = """You write spaced-repetition flashcards for a university student, from their \
own notes and lecture material.

- Each card tests one fact, definition, idea or step. Prefer understanding over trivia.
- The front is a question or prompt that has one clear answer; the back answers it concisely.
- Both sides may use markdown, and LaTeX math between $...$ (inline) or $$...$$ (display).
- Base every card on the material provided; don't add outside facts.
- Never repeat or rephrase a card the student already has."""


class CardProposal(BaseModel):
    front: str = Field(description="The question or prompt. Markdown and $math$ allowed.")
    back: str = Field(description="The answer. Markdown and $math$ allowed.")


class CardProposals(BaseModel):
    """The structured-output schema the AI fills in."""

    cards: list[CardProposal]


def build_prompt(source: SubmoduleSource, existing_fronts: Iterable[str], count: int) -> str:
    sections = [f'Write {count} new flashcards for the topic "{source.title}".']

    material = source.text_markdown()
    if material:
        sections.append(f"<material>\n{material}\n</material>")
    if source.raw_pdfs:
        names = ", ".join(a.filename for a in source.raw_pdfs)
        sections.append(f"The attached PDF documents ({names}) are lecture material for this topic too.")

    fronts = [f.strip() for f in existing_fronts if f.strip()]
    if fronts:
        listed = "\n".join(f"- {f}" for f in fronts)
        sections.append(
            "The student already has cards with these fronts. Don't propose these or near-duplicates:\n"
            f"<existing_cards>\n{listed}\n</existing_cards>"
        )

    sections.append(f"Return exactly {count} cards, or fewer if the material doesn't support that many.")
    return "\n\n".join(sections)


def clean_proposals(cards: Iterable[CardProposal], existing_fronts: Iterable[str], count: int) -> list[CardProposal]:
    """Trim whitespace, drop blank cards and duplicates (of existing fronts or each other), cap at `count`."""
    seen = {_normalise(f) for f in existing_fronts}
    cleaned: list[CardProposal] = []
    for card in cards:
        front, back = card.front.strip(), card.back.strip()
        key = _normalise(front)
        if not front or not back or key in seen:
            continue
        seen.add(key)
        cleaned.append(CardProposal(front=front, back=back))
        if len(cleaned) == count:
            break
    return cleaned


def generate_flashcards(
    ai: AIClient,
    source: SubmoduleSource,
    existing_fronts: Iterable[str],
    count: int = DEFAULT_CARD_COUNT,
    *,
    read_pdf: Callable[[str], bytes] = lambda path: Path(path).read_bytes(),
) -> list[CardProposal]:
    """Ask the AI for up to `count` new cards. Raises `ValueError` for a count outside 1..MAX,
    `AIError` for failed or unreadable replies."""
    if not 1 <= count <= MAX_CARD_COUNT:
        raise ValueError(f"Card count must be between 1 and {MAX_CARD_COUNT}.")
    existing = list(existing_fronts)
    reply = ai.complete_structured(
        build_prompt(source, existing, count),
        CardProposals,
        system=SYSTEM_PROMPT,
        documents=source.documents(read_pdf),
    )
    return clean_proposals(reply.cards, existing, count)


def _normalise(front: str) -> str:
    return re.sub(r"\s+", " ", front).strip().casefold()
