from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.assignment import Assignment
from app.schemas.assignment import AssignmentCreate, AssignmentRead, AssignmentUpdate

router = APIRouter(prefix="/assignments", tags=["assignments"])


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
    for field, value in payload.model_dump(exclude_unset=True).items():
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
