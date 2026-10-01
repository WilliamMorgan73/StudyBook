from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.attachments import store_upload
from app.models.assignment import Assignment
from app.models.attachment import Attachment
from app.models.enums import AssignmentKind
from app.models.submodule import Submodule
from app.models.todo import AssignmentTodo
from app.schemas.assignment import AssignmentCreate, AssignmentRead, AssignmentUpdate
from app.schemas.attachment import AttachmentRead
from app.schemas.todo import TodoCreate, TodoRead, TodoUpdate

router = APIRouter(prefix="/assignments", tags=["assignments"])


def _check_total_weight(
    db: Session, module_id: int, new_weight: float, exclude_assignment_id: int | None = None
) -> None:
    stmt = select(func.coalesce(func.sum(Assignment.weight_percent), 0)).where(Assignment.module_id == module_id)
    if exclude_assignment_id is not None:
        stmt = stmt.where(Assignment.id != exclude_assignment_id)
    other_total = float(db.scalar(stmt) or 0)
    if other_total + new_weight > 100:
        raise HTTPException(
            400,
            f"Total weighting for this module would be {other_total + new_weight:.2f}%, "
            f"which exceeds 100% (other assignments already total {other_total:.2f}%)",
        )


def _covered_submodules(db: Session, module_id: int, submodule_ids: list[int]) -> list[Submodule]:
    """Load the given Submodules, rejecting any that don't exist or belong to another Module."""
    if not submodule_ids:
        return []
    submodules = list(db.scalars(select(Submodule).where(Submodule.id.in_(submodule_ids))).all())
    if len(submodules) != len(set(submodule_ids)) or any(s.module_id != module_id for s in submodules):
        raise HTTPException(400, "Covered submodules must belong to the assignment's module")
    return submodules


def _get_assignment_or_404(db: Session, assignment_id: int) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(404, "Assignment not found")
    return assignment


@router.get("", response_model=list[AssignmentRead])
def list_assignments(
    upcoming: bool = False,
    limit: int | None = None,
    db: Session = Depends(get_db),
) -> list[Assignment]:
    stmt = select(Assignment)
    if upcoming:
        stmt = stmt.where(Assignment.status != "graded").order_by(Assignment.due_at.asc().nulls_last())
    if limit:
        stmt = stmt.limit(limit)
    return list(db.scalars(stmt).all())


@router.post("", response_model=AssignmentRead, status_code=201)
def create_assignment(payload: AssignmentCreate, db: Session = Depends(get_db)) -> Assignment:
    _check_total_weight(db, payload.module_id, payload.weight_percent)
    covered_ids = payload.covered_submodule_ids
    assignment = Assignment(**payload.model_dump(exclude={"covered_submodule_ids"}))
    if covered_ids is None:
        assignment.covered_submodules = (
            list(db.scalars(select(Submodule).where(Submodule.module_id == payload.module_id)).all())
            if payload.kind == AssignmentKind.exam
            else []
        )
    else:
        assignment.covered_submodules = _covered_submodules(db, payload.module_id, covered_ids)
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.get("/{assignment_id}", response_model=AssignmentRead)
def get_assignment(assignment_id: int, db: Session = Depends(get_db)) -> Assignment:
    return _get_assignment_or_404(db, assignment_id)


@router.patch("/{assignment_id}", response_model=AssignmentRead)
def update_assignment(assignment_id: int, payload: AssignmentUpdate, db: Session = Depends(get_db)) -> Assignment:
    assignment = _get_assignment_or_404(db, assignment_id)
    updates = payload.model_dump(exclude_unset=True)
    if "weight_percent" in updates:
        _check_total_weight(db, assignment.module_id, updates["weight_percent"], exclude_assignment_id=assignment_id)
    if "covered_submodule_ids" in updates:
        covered_ids = updates.pop("covered_submodule_ids") or []
        assignment.covered_submodules = _covered_submodules(db, assignment.module_id, covered_ids)
    for field, value in updates.items():
        setattr(assignment, field, value)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/{assignment_id}", status_code=204)
def delete_assignment(assignment_id: int, db: Session = Depends(get_db)) -> None:
    assignment = _get_assignment_or_404(db, assignment_id)
    db.delete(assignment)
    db.commit()


@router.post("/{assignment_id}/attachments", response_model=AttachmentRead, status_code=201)
def upload_attachment(assignment_id: int, file: UploadFile, db: Session = Depends(get_db)) -> Attachment:
    _get_assignment_or_404(db, assignment_id)
    kind, filename, file_path = store_upload(file, f"assignments/{assignment_id}")
    attachment = Attachment(assignment_id=assignment_id, kind=kind, filename=filename, file_path=file_path)
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.post("/{assignment_id}/todos", response_model=TodoRead, status_code=201)
def create_todo(assignment_id: int, payload: TodoCreate, db: Session = Depends(get_db)) -> AssignmentTodo:
    _get_assignment_or_404(db, assignment_id)
    todo = AssignmentTodo(assignment_id=assignment_id, text=payload.text)
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.patch("/{assignment_id}/todos/{todo_id}", response_model=TodoRead)
def update_todo(assignment_id: int, todo_id: int, payload: TodoUpdate, db: Session = Depends(get_db)) -> AssignmentTodo:
    todo = db.get(AssignmentTodo, todo_id)
    if todo is None or todo.assignment_id != assignment_id:
        raise HTTPException(404, "Todo not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(todo, field, value)
    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/{assignment_id}/todos/{todo_id}", status_code=204)
def delete_todo(assignment_id: int, todo_id: int, db: Session = Depends(get_db)) -> None:
    todo = db.get(AssignmentTodo, todo_id)
    if todo is None or todo.assignment_id != assignment_id:
        raise HTTPException(404, "Todo not found")
    db.delete(todo)
    db.commit()
