import re

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.module import Module
from app.models.submodule import Submodule
from app.models.submodule_link import SubmoduleLink

WIKILINK_PATTERN = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")


def extract_wikilink_titles(markdown: str) -> list[str]:
    """Raw [[Title]] or [[Title|Alias]] targets referenced in a submodule's content_markdown."""
    return [match.strip() for match in WIKILINK_PATTERN.findall(markdown)]


def resolve_wikilink(db: Session, title: str, current_module_id: int) -> Submodule | None:
    """Resolve a raw wikilink target to a Submodule.

    "Module Title/Submodule Title" disambiguates when the same title exists in multiple modules;
    otherwise prefers a match in current_module_id, falling back to the first match anywhere.
    Returns None when unresolved (the link just won't appear in the backlinks graph).
    """
    module_name, _, submodule_title = title.rpartition("/")
    if module_name:
        return db.scalar(
            select(Submodule)
            .join(Module)
            .where(Module.name.ilike(module_name), Submodule.title.ilike(submodule_title))
        )

    same_module = db.scalar(
        select(Submodule).where(Submodule.module_id == current_module_id, Submodule.title.ilike(title))
    )
    if same_module is not None:
        return same_module
    return db.scalar(select(Submodule).where(Submodule.title.ilike(title)).order_by(Submodule.id))


def sync_outgoing_links(db: Session, submodule: Submodule) -> None:
    """Re-derive submodule's outgoing wikilinks from its current content_markdown."""
    resolved_ids: set[int] = set()
    for title in extract_wikilink_titles(submodule.content_markdown):
        target = resolve_wikilink(db, title, submodule.module_id)
        if target is not None and target.id != submodule.id:
            resolved_ids.add(target.id)

    existing = db.scalars(select(SubmoduleLink).where(SubmoduleLink.source_submodule_id == submodule.id)).all()
    for link in existing:
        if link.target_submodule_id in resolved_ids:
            resolved_ids.discard(link.target_submodule_id)
        else:
            db.delete(link)

    for target_id in resolved_ids:
        db.add(SubmoduleLink(source_submodule_id=submodule.id, target_submodule_id=target_id))
    db.commit()


def get_backlinks(db: Session, submodule_id: int) -> list[Submodule]:
    """Submodules whose content_markdown links to submodule_id."""
    return list(
        db.scalars(
            select(Submodule)
            .join(SubmoduleLink, SubmoduleLink.source_submodule_id == Submodule.id)
            .where(SubmoduleLink.target_submodule_id == submodule_id)
            .options(selectinload(Submodule.module))
        ).all()
    )
