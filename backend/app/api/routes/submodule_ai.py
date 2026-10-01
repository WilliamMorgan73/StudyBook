"""AI actions on a Submodule. Every one sends the same source material (`services/submodule_source`):
`GET /submodules/{id}/ai-source` estimates it so the UI can confirm first, and each action takes
the same `raw_pdf_ids` opt-in and loads it through `load_submodule_source`."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_ai_client
from app.core.database import get_db
from app.models.submodule import Submodule
from app.schemas.ai_source import SubmoduleSourceEstimate
from app.schemas.flashcard import (
    FlashcardGenerateRequest,
    FlashcardProposal,
    FlashcardProposals,
)
from app.schemas.submodule import SubmoduleDetail, SubmoduleSummaryRequest
from app.services.ai import AIClient
from app.services.flashcard_generation import generate_flashcards
from app.services.submodule_source import (
    RawPdfNotAllowedError,
    SubmoduleSource,
    gather_submodule_source,
)
from app.services.submodule_summary import source_hash, summarize

router = APIRouter(prefix="/submodules", tags=["ai"])


def load_submodule_source(db: Session, submodule_id: int, raw_pdf_ids: list[int]) -> SubmoduleSource:
    """Gather a Submodule's source material, committing any newly cached Attachment extractions.
    404 for an unknown Submodule, 422 for a raw-PDF id that isn't one of its near-empty PDFs."""
    submodule = db.get(Submodule, submodule_id)
    if submodule is None:
        raise HTTPException(404, "Submodule not found")
    try:
        source = gather_submodule_source(submodule, raw_pdf_ids=raw_pdf_ids)
    except RawPdfNotAllowedError as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        # Keep conversions that succeeded even if something else failed.
        if any(db.is_modified(a) for a in submodule.attachments):
            db.commit()
    return source


@router.get("/{submodule_id}/ai-source", response_model=SubmoduleSourceEstimate)
def estimate_source(
    submodule_id: int, raw_pdf_ids: list[int] = Query(default=[]), db: Session = Depends(get_db)
) -> SubmoduleSourceEstimate:
    """What AI features would send for this Submodule and its estimated size. Converts
    Attachments on first use (and caches them), so it can take a few seconds."""
    return SubmoduleSourceEstimate.from_source(load_submodule_source(db, submodule_id, raw_pdf_ids))


@router.post("/{submodule_id}/flashcards/generate", response_model=FlashcardProposals)
def generate_submodule_flashcards(
    submodule_id: int,
    payload: FlashcardGenerateRequest,
    db: Session = Depends(get_db),
    ai: AIClient = Depends(get_ai_client),
) -> FlashcardProposals:
    """Proposes new cards from the note and Attachments. Writes nothing: accepted proposals are
    saved by the client through `POST /flashcards` with `source="ai"`."""
    source = load_submodule_source(db, submodule_id, payload.raw_pdf_ids)
    if source.is_empty:
        raise HTTPException(422, "There's nothing to generate from yet: write some notes or attach lecture files.")
    submodule = db.get(Submodule, submodule_id)
    existing_fronts = [card.front for card in submodule.flashcards]
    try:
        cards = generate_flashcards(ai, source, existing_fronts, payload.count)
    except OSError as exc:
        raise HTTPException(422, f"Couldn't read a PDF to send: {exc}") from exc
    return FlashcardProposals(proposals=[FlashcardProposal(front=c.front, back=c.back) for c in cards])


@router.post("/{submodule_id}/summary", response_model=SubmoduleDetail)
def summarize_submodule(
    submodule_id: int,
    payload: SubmoduleSummaryRequest,
    db: Session = Depends(get_db),
    ai: AIClient = Depends(get_ai_client),
) -> SubmoduleDetail:
    """Generates (or regenerates) the Submodule's summary and stores it with the source hash it
    was made from. Only ever runs on request. A failure leaves any previous summary untouched."""
    source = load_submodule_source(db, submodule_id, payload.raw_pdf_ids)
    if source.is_empty:
        raise HTTPException(422, "There's nothing to summarise yet: write some notes or attach lecture files.")
    try:
        summary = summarize(ai, source)
    except OSError as exc:
        raise HTTPException(422, f"Couldn't read a PDF to send: {exc}") from exc
    submodule = db.get(Submodule, submodule_id)
    submodule.summary_markdown = summary
    submodule.summary_source_hash = source_hash(source)
    db.commit()
    db.refresh(submodule)
    return SubmoduleDetail.from_submodule(submodule)
