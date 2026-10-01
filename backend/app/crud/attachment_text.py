"""Local text extraction for Attachments: the one place AI features get an Attachment's text from.

PDF and PPTX Attachments are converted to markdown with `markitdown` the first time something
asks, and the result is cached on `Attachment.extracted_markdown`. Everything else (video,
audio, images, legacy `.ppt`, unknown files) is not extractable.

`get_extracted_text` is the entry point for routes and AI features. The conversion itself is
injectable (`convert=`) so callers and tests can swap it out; the pure helpers
(`is_extractable`, `is_near_empty`) need no files at all.
"""

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from app.models.attachment import Attachment
from app.models.enums import AttachmentKind

EXTRACTABLE_KINDS = frozenset({AttachmentKind.pdf, AttachmentKind.pptx})

# Fewer letters/digits than this and a PDF counts as near-empty (most likely scanned images).
NEAR_EMPTY_MIN_CHARS = 100

# `store_upload` files legacy `.ppt` under the pptx kind, but markitdown only reads OOXML `.pptx`.
_UNSUPPORTED_SUFFIXES = frozenset({".ppt"})


class AttachmentNotExtractableError(Exception):
    """The Attachment's kind/format has no text extraction (video, audio, image, `.ppt`, ...)."""


class AttachmentExtractionFailedError(Exception):
    """The file is a supported kind but could not be converted (missing or corrupt file)."""


@dataclass(frozen=True)
class ExtractedText:
    markdown: str
    near_empty: bool
    """True for a PDF that yielded almost no text, so AI features can offer the raw PDF instead."""


def is_extractable(kind: AttachmentKind, filename: str) -> bool:
    if kind not in EXTRACTABLE_KINDS:
        return False
    return Path(filename).suffix.lower() not in _UNSUPPORTED_SUFFIXES


def is_near_empty(markdown: str) -> bool:
    """Whether extracted text is too thin to be useful, counting only letters and digits."""
    return sum(ch.isalnum() for ch in markdown) < NEAR_EMPTY_MIN_CHARS


def convert_to_markdown(path: str | Path) -> str:
    """Convert a PDF/PPTX file on disk to markdown with markitdown (local, no network)."""
    from markitdown import MarkItDown, MarkItDownException

    try:
        result = MarkItDown(enable_plugins=False).convert_local(path)
    except (MarkItDownException, OSError) as exc:
        raise AttachmentExtractionFailedError(str(exc)) from exc
    return result.text_content.strip()


def get_extracted_text(
    attachment: Attachment,
    convert: Callable[[str], str] = convert_to_markdown,
) -> ExtractedText:
    """Return an Attachment's extracted markdown, converting and caching it on first call.

    On a cache miss this sets `attachment.extracted_markdown`; the caller commits the session.
    Raises `AttachmentNotExtractableError` for unsupported kinds and
    `AttachmentExtractionFailedError` if conversion fails (failures are not cached).
    """
    if not is_extractable(attachment.kind, attachment.filename):
        raise AttachmentNotExtractableError(f"Text extraction is not supported for {_describe(attachment)} files.")

    if attachment.extracted_markdown is None:
        attachment.extracted_markdown = convert(attachment.file_path)

    markdown = attachment.extracted_markdown
    return ExtractedText(
        markdown=markdown,
        near_empty=attachment.kind == AttachmentKind.pdf and is_near_empty(markdown),
    )


def _describe(attachment: Attachment) -> str:
    suffix = Path(attachment.filename).suffix.lower()
    if suffix in _UNSUPPORTED_SUFFIXES:
        return f"legacy {suffix}"
    return attachment.kind.value
