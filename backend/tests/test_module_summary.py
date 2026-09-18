from datetime import UTC, datetime, timedelta

import app.models  # noqa: F401  registers relationship string refs before we touch the mapper
from app.crud.modules import build_module_summary
from app.models.assignment import Assignment
from app.models.enums import AssignmentStatus
from app.models.lecture import Lecture
from app.models.module import Module


def make_module(assignments: list[Assignment] | None = None, lectures: list[Lecture] | None = None) -> Module:
    module = Module(id=1, name="Test Module", color="#6366f1")
    module.assignments = assignments or []
    module.lectures = lectures or []
    return module


def make_assignment(
    weight_percent: float,
    status: AssignmentStatus,
    grade_earned: float | None = None,
    grade_max: float | None = None,
) -> Assignment:
    return Assignment(
        title="Assignment",
        status=status,
        weight_percent=weight_percent,
        grade_earned=grade_earned,
        grade_max=grade_max,
    )


def test_build_module_summary_with_no_assignments_or_lectures():
    summary = build_module_summary(make_module())

    assert summary.current_grade is None
    assert summary.next_lecture_at is None
    assert summary.assignment_progress.total == 0
    assert summary.completion_progress.completed_fraction == 0
    assert summary.completion_progress.achieved_fraction == 0


def test_build_module_summary_weights_graded_assignments_by_weight_percent():
    module = make_module(
        assignments=[
            make_assignment(60, AssignmentStatus.graded, grade_earned=80, grade_max=100),
            make_assignment(40, AssignmentStatus.not_started),
        ]
    )

    summary = build_module_summary(module)

    assert summary.current_grade == 80.0
    assert summary.assignment_progress.graded == 1
    assert summary.assignment_progress.not_started == 1
    assert summary.completion_progress.completed_fraction == 0.6
    assert summary.completion_progress.achieved_fraction == 0.48


def test_build_module_summary_picks_soonest_upcoming_lecture():
    now = datetime.now(UTC).replace(tzinfo=None)
    module = make_module(
        lectures=[
            Lecture(title="Later", scheduled_at=now + timedelta(days=7)),
            Lecture(title="Next", scheduled_at=now + timedelta(days=1)),
            Lecture(title="Past", scheduled_at=now - timedelta(days=1)),
        ]
    )

    summary = build_module_summary(module)

    assert summary.next_lecture_at == (now + timedelta(days=1)).isoformat()
