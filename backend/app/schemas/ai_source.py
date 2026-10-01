from pydantic import BaseModel

from app.models.enums import AttachmentKind
from app.services.submodule_source import LARGE_REQUEST_TOKENS, SubmoduleSource


class SourceAttachmentRead(BaseModel):
    attachment_id: int
    filename: str
    kind: AttachmentKind
    near_empty: bool
    send_raw_pdf: bool
    estimated_tokens: int
    raw_pdf_estimated_tokens: int | None
    error: str | None


class SubmoduleSourceEstimate(BaseModel):
    """What an AI feature would send for a Submodule, and roughly how big it is."""

    submodule_id: int
    note_estimated_tokens: int
    estimated_tokens: int
    large: bool
    large_threshold_tokens: int
    is_empty: bool
    attachments: list[SourceAttachmentRead]

    @classmethod
    def from_source(cls, source: SubmoduleSource) -> "SubmoduleSourceEstimate":
        return cls(
            submodule_id=source.submodule_id,
            note_estimated_tokens=source.note_estimated_tokens,
            estimated_tokens=source.estimated_tokens,
            large=source.large,
            large_threshold_tokens=LARGE_REQUEST_TOKENS,
            is_empty=source.is_empty,
            attachments=[
                SourceAttachmentRead(
                    attachment_id=a.attachment_id,
                    filename=a.filename,
                    kind=a.kind,
                    near_empty=a.near_empty,
                    send_raw_pdf=a.send_raw_pdf,
                    estimated_tokens=a.estimated_tokens,
                    raw_pdf_estimated_tokens=a.raw_pdf_estimated_tokens,
                    error=a.error,
                )
                for a in source.attachments
            ],
        )
