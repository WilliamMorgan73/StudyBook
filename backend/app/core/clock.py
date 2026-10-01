from datetime import UTC, datetime


def local_now() -> datetime:
    """The server's local wall-clock time, naive.

    Student-entered datetimes (lectures, assignment due dates, revision sessions) are stored
    naive in local time (the frontend's `toNaiveDateTime`), so compare against this, not UTC.
    Server-generated timestamps (DB `now()` defaults, flashcard scheduling) follow UTC instead.
    """
    return datetime.now(UTC).astimezone().replace(tzinfo=None, microsecond=0)
