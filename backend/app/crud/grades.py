from app.models.assignment import Assignment


def compute_current_grade(assignments: list[Assignment]) -> float | None:
    """Weighted average percentage across graded assignments, weighted by weight_percent."""
    graded = [a for a in assignments if a.grade_earned is not None and a.grade_max]
    if not graded:
        return None

    total_weight = sum(float(a.weight_percent) for a in graded)
    if total_weight == 0:
        return None
    return sum(float(a.grade_earned) / float(a.grade_max) * 100 * float(a.weight_percent) for a in graded) / total_weight


def compute_assignment_progress(assignments: list[Assignment]) -> dict[str, int]:
    """Buckets assignments by completion stage for assignment-list displays."""
    graded = sum(1 for a in assignments if a.status == "graded")
    in_progress = sum(1 for a in assignments if a.status in ("in_progress", "submitted"))
    not_started = len(assignments) - graded - in_progress
    return {"graded": graded, "in_progress": in_progress, "not_started": not_started, "total": len(assignments)}


def compute_completion_progress(assignments: list[Assignment]) -> dict[str, float]:
    """Weight-based progress for the module progress ring: how much of the module's grade is
    locked in (submitted or graded) vs. how much of that locked-in portion was actually earned.

    Both fractions are out of the module's full 100%, not out of the assignments created so far —
    an ungraded/not-yet-created portion of the module just shows as the ring's unfilled remainder.
    """
    completed_weight = 0.0
    achieved_weight = 0.0
    for a in assignments:
        if a.status in ("submitted", "graded"):
            completed_weight += float(a.weight_percent)
        if a.status == "graded" and a.grade_earned is not None and a.grade_max:
            fraction = max(0.0, min(1.0, float(a.grade_earned) / float(a.grade_max)))
            achieved_weight += float(a.weight_percent) * fraction
    return {"completed_fraction": completed_weight / 100, "achieved_fraction": achieved_weight / 100}
