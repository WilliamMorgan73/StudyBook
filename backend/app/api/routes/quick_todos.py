from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.quick_todo import QuickTodo
from app.schemas.quick_todo import QuickTodoCreate, QuickTodoRead, QuickTodoUpdate

router = APIRouter(prefix="/quick-todos", tags=["quick-todos"])


@router.get("", response_model=list[QuickTodoRead])
def list_quick_todos(db: Session = Depends(get_db)) -> list[QuickTodo]:
    return list(db.scalars(select(QuickTodo).order_by(QuickTodo.created_at)).all())


@router.post("", response_model=QuickTodoRead, status_code=201)
def create_quick_todo(payload: QuickTodoCreate, db: Session = Depends(get_db)) -> QuickTodo:
    todo = QuickTodo(text=payload.text)
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.patch("/{todo_id}", response_model=QuickTodoRead)
def update_quick_todo(todo_id: int, payload: QuickTodoUpdate, db: Session = Depends(get_db)) -> QuickTodo:
    todo = db.get(QuickTodo, todo_id)
    if todo is None:
        raise HTTPException(404, "Todo not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(todo, field, value)
    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/{todo_id}", status_code=204)
def delete_quick_todo(todo_id: int, db: Session = Depends(get_db)) -> None:
    todo = db.get(QuickTodo, todo_id)
    if todo is None:
        raise HTTPException(404, "Todo not found")
    db.delete(todo)
    db.commit()
