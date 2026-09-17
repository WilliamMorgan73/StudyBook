import enum


class AssignmentStatus(str, enum.Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    submitted = "submitted"
    graded = "graded"


class AttachmentKind(str, enum.Enum):
    pdf = "pdf"
    pptx = "pptx"
    video = "video"
    audio = "audio"
    image = "image"
    other = "other"
