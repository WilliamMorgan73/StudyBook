"""A Submodule's source material for AI features: its note plus its PDF/PPTX Attachments' text.

Shared by every feature that sends "this topic" to the AI (flashcard generation, summaries), so
they all send the same thing, estimate its size the same way, and treat near-empty PDFs the same:

- `gather_submodule_source(submodule, raw_pdf_ids=...)` extracts each Attachment's text through
  `crud/attachment_text.get_extracted_text` (converting and caching on first use; the caller
  commits) and returns a `SubmoduleSource`.
- `SubmoduleSource` reports a rough input-size estimate (`estimated_tokens`, `large`) and which
  PDFs came out near-empty, so the UI can confirm before a large request.
- A near-empty PDF's original file is only sent when its id is passed in `raw_pdf_ids`, i.e. after
  the student explicitly opted in. It then replaces the (thin) extracted text, as an `AIDocument`.

Nothing here calls the AI. Extraction and page counting are injectable so tests need no files.
"""

import math
from collections.abc import Callable, Collection
from dataclasses import dataclass
from pathlib import Path

from app.crud.attachment_text import (
    AttachmentExtractionFailedError,
    ExtractedText,
    get_extracted_text,
    is_extractable,
)
from app.models.attachment import Attachment
from app.models.enums import AttachmentKind
from app.models.submodule import Submodule
from app.services.ai import AIDocument
from app.services.ai_models import AI_PROVIDERS

# Rough English-text ratio; good enough for a "this is big" warning, not for billing.
CHARS_PER_TOKEN = 4
# Per raw PDF page; depends on the provider (`AIProviderInfo.pdf_tokens_per_page`).
PDF_TOKENS_PER_PAGE = AI_PROVIDERS["anthropic"].pdf_tokens_per_page
# Above this estimate the UI asks for confirmation before sending.
LARGE_REQUEST_TOKENS = 20_000


class RawPdfNotAllowedError(ValueError):
    """A raw PDF was requested for an Attachment that isn't one of this Submodule's near-empty PDFs."""


@dataclass(frozen=True)
class SourceAttachment:
    attachment_id: int
    filename: str
    kind: AttachmentKind
    file_path: str
    """Where the file is on disk (`Attachment.stored_path`)."""
    markdown: str
    """Extracted text; empty when extraction failed."""
    near_empty: bool
    send_raw_pdf: bool
    """The original PDF is sent instead of `markdown` (only ever for a near-empty PDF)."""
    error: str | None = None
    """Why extraction failed; such an Attachment is left out of the request."""
    raw_pdf_estimated_tokens: int | None = None
    """For near-empty PDFs: the estimated cost of sending the original instead."""

    @property
    def estimated_tokens(self) -> int:
        if self.send_raw_pdf:
            return self.raw_pdf_estimated_tokens or 0
        if self.error is not None:
            return 0
        return estimate_tokens(self.markdown)


@dataclass(frozen=True)
class SubmoduleSource:
    submodule_id: int
    title: str
    note_markdown: str
    attachments: tuple[SourceAttachment, ...]

    @property
    def note_estimated_tokens(self) -> int:
        return estimate_tokens(self.note_markdown)

    @property
    def estimated_tokens(self) -> int:
        """Estimated input size of the material itself (prompt wording comes on top)."""
        return self.note_estimated_tokens + sum(a.estimated_tokens for a in self.attachments)

    @property
    def large(self) -> bool:
        return self.estimated_tokens > LARGE_REQUEST_TOKENS

    @property
    def near_empty_attachments(self) -> list[SourceAttachment]:
        return [a for a in self.attachments if a.near_empty]

    @property
    def raw_pdfs(self) -> list[SourceAttachment]:
        return [a for a in self.attachments if a.send_raw_pdf]

    @property
    def is_empty(self) -> bool:
        """Nothing worth sending: a blank note and no usable Attachment text or PDFs."""
        return not self.note_markdown.strip() and not any(
            a.send_raw_pdf or (a.error is None and a.markdown.strip()) for a in self.attachments
        )

    def text_markdown(self) -> str:
        """The note and every extracted Attachment text as one tagged document for a prompt.
        Attachments sent as raw PDFs or that failed to extract are not included here."""
        parts: list[str] = []
        if self.note_markdown.strip():
            parts.append(f'<note title="{_attr(self.title)}">\n{self.note_markdown.strip()}\n</note>')
        for a in self.attachments:
            if a.send_raw_pdf or a.error is not None or not a.markdown.strip():
                continue
            parts.append(f'<attachment filename="{_attr(a.filename)}">\n{a.markdown.strip()}\n</attachment>')
        return "\n\n".join(parts)

    def documents(self, read: Callable[[str], bytes] = lambda path: Path(path).read_bytes()) -> list[AIDocument]:
        """The opted-in raw PDFs as `AIDocument`s (reads the files; raises `OSError` if one is gone)."""
        return [AIDocument(title=a.filename, data=read(a.file_path)) for a in self.raw_pdfs]


def estimate_tokens(text: str) -> int:
    return math.ceil(len(text) / CHARS_PER_TOKEN)


def pdf_page_count(path: str) -> int | None:
    """Pages in a PDF on disk, or None if it can't be read."""
    from pdfminer.pdfpage import PDFPage

    try:
        with open(path, "rb") as fh:
            return sum(1 for _ in PDFPage.get_pages(fh))
    except Exception:  # noqa: BLE001  pdfminer raises a zoo of exception types on bad files
        return None


def gather_submodule_source(
    submodule: Submodule,
    *,
    raw_pdf_ids: Collection[int] = (),
    extract: Callable[[Attachment], ExtractedText] = get_extracted_text,
    count_pages: Callable[[str], int | None] = pdf_page_count,
    pdf_tokens_per_page: int = PDF_TOKENS_PER_PAGE,
) -> SubmoduleSource:
    """Collect `submodule`'s note and the text of its extractable Attachments.

    May convert Attachments and set their `extracted_markdown` cache; the caller commits.
    Raises `RawPdfNotAllowedError` if `raw_pdf_ids` names anything other than one of this
    Submodule's near-empty PDFs. `pdf_tokens_per_page` sizes the raw-PDF estimates for the
    selected provider.
    """
    raw_requested = set(raw_pdf_ids)
    attachments: list[SourceAttachment] = []
    raw_allowed: set[int] = set()

    for attachment in sorted(submodule.attachments, key=lambda a: a.id):
        if not is_extractable(attachment.kind, attachment.filename):
            continue  # video, audio, images, legacy .ppt: never sent
        base = {
            'attachment_id': attachment.id,
            'filename': attachment.filename,
            'kind': attachment.kind,
            'file_path': attachment.stored_path,
        }
        try:
            extracted = extract(attachment)
        except AttachmentExtractionFailedError as exc:
            attachments.append(SourceAttachment(**base, markdown="", near_empty=False, send_raw_pdf=False, error=str(exc)))
            continue

        raw_tokens = None
        if extracted.near_empty:
            raw_allowed.add(attachment.id)
            raw_tokens = (count_pages(attachment.stored_path) or 1) * pdf_tokens_per_page
        attachments.append(
            SourceAttachment(
                **base,
                markdown=extracted.markdown,
                near_empty=extracted.near_empty,
                send_raw_pdf=attachment.id in raw_requested and extracted.near_empty,
                raw_pdf_estimated_tokens=raw_tokens,
            )
        )

    not_allowed = raw_requested - raw_allowed
    if not_allowed:
        ids = ", ".join(str(i) for i in sorted(not_allowed))
        raise RawPdfNotAllowedError(
            f"Only this submodule's near-empty PDFs can be sent as raw PDFs (attachment {ids} isn't one)."
        )

    return SubmoduleSource(
        submodule_id=submodule.id,
        title=submodule.title,
        note_markdown=submodule.content_markdown or "",
        attachments=tuple(attachments),
    )


def _attr(value: str) -> str:
    return value.replace('"', "'")
