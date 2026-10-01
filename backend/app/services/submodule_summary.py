"""AI Submodule summaries: one markdown summary of a Submodule's source material, stored on the row.

- `summarize(ai, source)` asks Claude for the summary text; the route stores it in
  `Submodule.summary_markdown` together with `source_hash(source)`.
- `source_hash` is a pure function of the material (note plus each extractable Attachment's
  text), so the stale flag is just "the hash now differs from the stored one". It ignores the
  raw-PDF opt-in (sending a scanned PDF as the original is a different form of the same file,
  not new material) and the Submodule title.
- `summary_is_stale(submodule)` recomputes the hash on read from cached extractions only: it
  never converts a file. An Attachment with no cached text (failed, or uploaded since and not
  converted yet) hashes as "unreadable", which is also how a failed extraction hashed at
  generation time, so a new upload still makes the summary stale.

Summaries are only ever (re)generated on request; nothing here runs automatically.
"""

import hashlib
import json
from collections.abc import Callable
from pathlib import Path

from app.crud.attachment_text import (
    AttachmentExtractionFailedError,
    ExtractedText,
    get_extracted_text,
)
from app.models.attachment import Attachment
from app.models.submodule import Submodule
from app.services.ai import AIClient, AIError
from app.services.submodule_source import SubmoduleSource, gather_submodule_source

MAX_SUMMARY_TOKENS = 8000

SYSTEM_PROMPT = """You write study summaries for a university student, from their own notes and \
lecture material for one topic.

- Cover the key ideas, definitions, results and methods, in the order that makes them easiest to learn.
- Be concise: a summary to revise from, not a rewrite of the material.
- Use markdown headings, lists and tables where they help, and LaTeX math between $...$ (inline) \
or $$...$$ (display).
- Base everything on the material provided; don't add outside facts.
- Reply with the summary only, with no preamble or closing remarks."""


def source_hash(source: SubmoduleSource) -> str:
    """SHA-256 of the source material: the note and every extractable Attachment's text (in id
    order), with failed extractions as `null`. Independent of raw-PDF opt-ins and the title."""
    material = {
        "note": source.note_markdown.strip(),
        "attachments": [
            [a.attachment_id, a.filename, None if a.error is not None else a.markdown.strip()]
            for a in source.attachments
        ],
    }
    encoded = json.dumps(material, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()


def build_prompt(source: SubmoduleSource) -> str:
    sections = [f'Summarise the topic "{source.title}" from this material.']
    material = source.text_markdown()
    if material:
        sections.append(f"<material>\n{material}\n</material>")
    if source.raw_pdfs:
        names = ", ".join(a.filename for a in source.raw_pdfs)
        sections.append(f"The attached PDF documents ({names}) are lecture material for this topic too.")
    return "\n\n".join(sections)


def summarize(
    ai: AIClient,
    source: SubmoduleSource,
    *,
    read_pdf: Callable[[str], bytes] = lambda path: Path(path).read_bytes(),
) -> str:
    """Ask Claude for a markdown summary. Raises `AIError` for failed or empty replies and
    `OSError` if an opted-in PDF can't be read."""
    reply = ai.complete(
        build_prompt(source),
        system=SYSTEM_PROMPT,
        max_tokens=MAX_SUMMARY_TOKENS,
        documents=source.documents(read_pdf),
    ).strip()
    if not reply:
        raise AIError("unknown", "Claude returned an empty summary. Try again.")
    return reply


def summary_is_stale(submodule: Submodule) -> bool:
    """Whether the material changed since the stored summary was generated (False with no summary).
    Reads cached extractions only, so it's cheap enough for every read and never writes."""
    if submodule.summary_markdown is None or submodule.summary_source_hash is None:
        return False
    current = gather_submodule_source(submodule, extract=_cached_text, count_pages=lambda _path: None)
    return source_hash(current) != submodule.summary_source_hash


def _cached_text(attachment: Attachment) -> ExtractedText:
    """`get_extracted_text` without converting: an uncached Attachment counts as unreadable."""

    def no_convert(_path: str) -> str:
        raise AttachmentExtractionFailedError("not converted yet")

    return get_extracted_text(attachment, convert=no_convert)
