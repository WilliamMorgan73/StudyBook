from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.module import Module
from app.models.submodule import Submodule


def resolve_wikilink(db: Session, title: str, current_module_id: int) -> Submodule | None:
    """Resolve a raw wikilink target to a Submodule.

    "Module Title/Submodule Title" disambiguates when the same title exists in multiple modules;
    otherwise prefers a match in current_module_id, falling back to the first match anywhere.
    Returns None when unresolved.
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
