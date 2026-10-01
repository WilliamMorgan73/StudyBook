from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.submodule import Submodule
from app.schemas.attachment import AttachmentRead
from app.services.submodule_summary import summary_is_stale


class SubmoduleBase(BaseModel):
    title: str
    content_markdown: str = ""


class SubmoduleCreate(SubmoduleBase):
    module_id: int


class SubmoduleUpdate(BaseModel):
    title: str | None = None
    content_markdown: str | None = None


class SubmoduleLinkTarget(BaseModel):
    """Resolved wikilink target, returned by GET /submodules/resolve for click-to-navigate."""

    id: int
    module_id: int


class SubmoduleIndexEntry(BaseModel):
    """Lightweight listing entry for the cross-module wikilink picker — no content_markdown/attachments."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    module_id: int
    module_name: str


class SubmoduleRead(SubmoduleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    module_id: int
    created_at: datetime
    updated_at: datetime
    attachments: list[AttachmentRead] = []


class SubmoduleDetail(SubmoduleRead):
    """A single Submodule with its AI summary. `summary_stale` is computed on read (see
    `services/submodule_summary`), so it's only on single-Submodule responses, not `ModuleDetail`."""

    summary_markdown: str | None = None
    summary_stale: bool = False

    @classmethod
    def from_submodule(cls, submodule: Submodule) -> "SubmoduleDetail":
        return cls.model_validate(submodule).model_copy(update={"summary_stale": summary_is_stale(submodule)})


class SubmoduleSummaryRequest(BaseModel):
    raw_pdf_ids: list[int] = []
