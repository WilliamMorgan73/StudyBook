from datetime import UTC, datetime

from app.crud.grades import (
    compute_assignment_progress,
    compute_completion_progress,
    compute_current_grade,
)
from app.models.module import Module
from app.schemas.module import ModuleRead, ModuleSummary


def _next_lecture_at(module: Module) -> str | None:
    upcoming = [lec for lec in module.lectures if lec.scheduled_at >= datetime.now(UTC).replace(tzinfo=None)]
    if not upcoming:
        return None
    return min(upcoming, key=lambda lec: lec.scheduled_at).scheduled_at.isoformat()


def build_module_summary(module: Module) -> ModuleSummary:
    """Assemble the derived fields (grade, next lecture, progress) shared by list_modules and get_module."""
    return ModuleSummary.model_validate(
        {
            **ModuleRead.model_validate(module).model_dump(),
            "current_grade": compute_current_grade(module.assignments),
            "next_lecture_at": _next_lecture_at(module),
            "assignment_progress": compute_assignment_progress(module.assignments),
            "completion_progress": compute_completion_progress(module.assignments),
        }
    )
