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
