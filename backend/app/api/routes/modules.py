from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.grades import compute_current_grade
from app.models.module import Module, ModuleLink
from app.schemas.module import ModuleCreate, ModuleDetail, ModuleRead, ModuleSummary

router = APIRouter(prefix="/modules", tags=["modules"])


def _next_lecture_at(module: Module) -> str | None:
    upcoming = [lec for lec in module.lectures if lec.scheduled_at >= datetime.now(UTC).replace(tzinfo=None)]
    if not upcoming:
        return None
    return min(upcoming, key=lambda lec: lec.scheduled_at).scheduled_at.isoformat()


@router.get("", response_model=list[ModuleSummary])
def list_modules(db: Session = Depends(get_db)) -> list[ModuleSummary]:
    modules = db.scalars(select(Module)).all()
    return [
        ModuleSummary.model_validate(
            {
                **ModuleRead.model_validate(m).model_dump(),
                "current_grade": compute_current_grade(m.assignments),
                "next_lecture_at": _next_lecture_at(m),
            }
        )
        for m in modules
    ]


@router.post("", response_model=ModuleRead, status_code=201)
def create_module(payload: ModuleCreate, db: Session = Depends(get_db)) -> Module:
    module = Module(**payload.model_dump())
    db.add(module)
    db.commit()
    db.refresh(module)
    return module


@router.get("/{module_id}", response_model=ModuleDetail)
def get_module(module_id: int, db: Session = Depends(get_db)) -> ModuleDetail:
    module = db.get(Module, module_id)
    if module is None:
        raise HTTPException(404, "Module not found")

    related_ids = db.scalars(
        select(ModuleLink.related_module_id).where(ModuleLink.module_id == module_id)
    ).all()
    related = db.scalars(select(Module).where(Module.id.in_(related_ids))).all() if related_ids else []

    return ModuleDetail.model_validate(
        {
            **ModuleRead.model_validate(module).model_dump(),
            "current_grade": compute_current_grade(module.assignments),
            "next_lecture_at": _next_lecture_at(module),
            "lectures": module.lectures,
            "assignments": module.assignments,
            "notes": module.notes,
            "flashcards": module.flashcards,
            "related_modules": related,
        }
    )


@router.post("/{module_id}/related/{related_module_id}", status_code=204)
def link_modules(module_id: int, related_module_id: int, db: Session = Depends(get_db)) -> None:
    if module_id == related_module_id:
        raise HTTPException(400, "A module cannot be related to itself")
    for a, b in [(module_id, related_module_id), (related_module_id, module_id)]:
        exists = db.scalar(
            select(ModuleLink).where(ModuleLink.module_id == a, ModuleLink.related_module_id == b)
        )
        if not exists:
            db.add(ModuleLink(module_id=a, related_module_id=b))
    db.commit()
