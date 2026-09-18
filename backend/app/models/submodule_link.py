from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SubmoduleLink(Base):
    """A directed wikilink extracted from one submodule's content_markdown to another,
    re-derived on every content_markdown save (see crud/submodule_links.py::sync_outgoing_links)."""

    __tablename__ = "submodule_links"
    __table_args__ = (UniqueConstraint("source_submodule_id", "target_submodule_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    source_submodule_id: Mapped[int] = mapped_column(ForeignKey("submodules.id", ondelete="CASCADE"), index=True)
    target_submodule_id: Mapped[int] = mapped_column(ForeignKey("submodules.id", ondelete="CASCADE"), index=True)

    source: Mapped["Submodule"] = relationship(foreign_keys=[source_submodule_id])  # noqa: F821
    target: Mapped["Submodule"] = relationship(foreign_keys=[target_submodule_id])  # noqa: F821
