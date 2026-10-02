from datetime import date, datetime, timedelta

from pydantic import BaseModel, ConfigDict, Field

from app.models.revision_session import RevisionSession


class RevisionPlanCreate(BaseModel):
    start_date: date
    weekdays: list[int]
    """0 = Monday ... 6 = Sunday."""
    session_minutes: int = Field(ge=15, le=480)


class SessionSubmodule(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str


class RevisionSessionRead(BaseModel):
    id: int
    assignment_id: int
    module_id: int
    exam_title: str
    starts_at: datetime
    ends_at: datetime
    duration_minutes: int
    done: bool
    guidance_markdown: str | None
    submodules: list[SessionSubmodule]

    @classmethod
    def from_row(cls, row: RevisionSession) -> "RevisionSessionRead":
        return cls(
            id=row.id,
            assignment_id=row.assignment_id,
            module_id=row.assignment.module_id,
            exam_title=row.assignment.title,
            starts_at=row.starts_at,
            ends_at=row.starts_at + timedelta(minutes=row.duration_minutes),
            duration_minutes=row.duration_minutes,
            done=row.done,
            guidance_markdown=row.guidance_markdown,
            submodules=[SessionSubmodule.model_validate(s) for s in row.submodules],
        )


class RevisionSessionUpdate(BaseModel):
    done: bool | None = None


class SessionTopic(SessionSubmodule):
    weakness: float
    """0 (never lapses) to 1 (always lapses); 0.5 with no review data."""


class WeakCard(BaseModel):
    id: int
    submodule_id: int | None
    front: str
    back: str
    lapse_rate: float
    review_count: int


class RevisionSessionDetail(RevisionSessionRead):
    """The session view: its topics with current weakness scores and the weakest Flashcards in them.
    Without AI guidance this is the whole view; with it, the guidance sits alongside."""

    topics: list[SessionTopic]
    weakest_cards: list[WeakCard]


class ShiftedTopic(SessionSubmodule):
    planned_weakness: float
    """When the plan was last made or replanned."""
    weakness: float


class RevisionPlanStatus(BaseModel):
    """Whether an exam's plan has drifted since it was last made or replanned. Never set without a plan,
    or once the exam has started."""

    needs_replan: bool
    planned_at: datetime | None
    missed_session_ids: list[int]
    """Sessions that ended without being ticked done."""
    shifted_topics: list[ShiftedTopic]
    """Covered Submodules whose weakness has moved enough to rebalance the plan."""
