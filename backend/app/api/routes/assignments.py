from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.assignment import Assignment
from app.schemas.assignment import AssignmentCreate, AssignmentRead, AssignmentUpdate

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
    assignment = Assignment(**payload.model_dump())
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.get("/{assignment_id}", response_model=AssignmentRead)
def get_assignment(assignment_id: int, db: Session = Depends(get_db)) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(404, "Assignment not found")
    return assignment


@router.patch("/{assignment_id}", response_model=AssignmentRead)
def update_assignment(assignment_id: int, payload: AssignmentUpdate, db: Session = Depends(get_db)) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(404, "Assignment not found")
    updates = payload.model_dump(exclude_unset=True)
    if "weight_percent" in updates:
        _check_total_weight(db, assignment.module_id, updates["weight_percent"], exclude_assignment_id=assignment_id)
    for field, value in updates.items():
        setattr(assignment, field, value)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/{assignment_id}", status_code=204)
def delete_assignment(assignment_id: int, db: Session = Depends(get_db)) -> None:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(404, "Assignment not found")
    db.delete(assignment)
    db.commit()
