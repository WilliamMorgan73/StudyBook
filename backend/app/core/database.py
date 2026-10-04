from collections.abc import Generator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


def create_sqlite_engine(url: str, **kwargs) -> Engine:
    """A SQLite engine set up the way the app needs it on every connection.

    - `foreign_keys=ON`: SQLite ignores foreign keys (and so ON DELETE CASCADE, which
      `CalendarFeedEvent` relies on via `passive_deletes`) unless each connection turns them on.
    - WAL + `busy_timeout`: FastAPI runs sync routes on a thread pool, so readers and a writer overlap;
      WAL lets reads proceed during a write, and the timeout makes a second writer wait instead of
      failing with "database is locked".
    """
    engine = create_engine(url, connect_args={"check_same_thread": False}, **kwargs)

    @event.listens_for(engine, "connect")
    def _configure(dbapi_connection, _record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        if url not in ("sqlite://", "sqlite:///:memory:"):
            cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

    return engine


engine = create_sqlite_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
