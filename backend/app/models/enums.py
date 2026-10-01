import enum


class AssignmentStatus(str, enum.Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    submitted = "submitted"
    graded = "graded"


class AssignmentKind(str, enum.Enum):
    coursework = "coursework"
    exam = "exam"


class AttachmentKind(str, enum.Enum):
    pdf = "pdf"
    pptx = "pptx"
    video = "video"
    audio = "audio"
    image = "image"
    other = "other"


class FlashcardSource(str, enum.Enum):
    """Who wrote a Flashcard: the student, or AI generation (accepted in the review dialog)."""

    manual = "manual"
    ai = "ai"
