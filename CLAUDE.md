# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StudyBook is a personal study app combining Obsidian-style markdown notes, Notion-style module/assignment/calendar organization, and Anki-style spaced-repetition flashcards. Single-user, no auth. See `README.md`.

Planned tech stack:
- **Frontend**: React + TypeScript, Tailwind + shadcn/ui (not yet scaffolded — `frontend/` is currently empty)
- **Backend**: FastAPI (Python), scaffolded under `backend/`
- **Database**: PostgreSQL via `docker-compose.yml` (service `postgres`, db/user/password all `studybook`)
- **AI integration**: Anthropic API, planned for note summarization, note→flashcard generation, revision scheduling, and semantic note search — not yet implemented

## Commands

All backend commands run from `backend/` and use `uv` (no manual venv activation needed — `uv run` handles it).

```bash
# Install/sync dependencies
uv sync

# Run the dev server (http://localhost:8000, docs at /docs)
uv run uvicorn app.main:app --reload

# Run tests
uv run pytest
uv run pytest tests/test_file.py::test_name   # single test

# Lint
uv run ruff check .

# Database migrations (Alembic — not yet initialized, see Architecture)
uv run alembic revision --autogenerate -m "message"
uv run alembic upgrade head
```

Postgres:
```bash
docker compose up -d       # from repo root; starts Postgres on localhost:5432
```

Frontend commands are not yet defined — `frontend/` has not been scaffolded.

## Architecture

### Backend layout (`backend/app/`)

- `models/` — SQLAlchemy 2.0 models (`Mapped`/`mapped_column` style). **Import order matters**: individual model modules use bare string forward refs (e.g. `Mapped["Module"]`) for relationships instead of importing each other, to avoid circular imports. `models/__init__.py` is the single place that imports every model module and registers them with SQLAlchemy's mapper registry — always import models via `app.models` (or ensure `app.models` has been imported) before touching `Base.metadata` or querying, or relationship string refs won't resolve.
- `schemas/` — Pydantic request/response models, separate from SQLAlchemy models. `ModuleDetail` (in `schemas/module.py`) is the aggregate payload for the module page: it composes lectures, assignments, notes, flashcards, and related modules plus computed fields (`current_grade`, `next_lecture_at`) that don't exist as DB columns.
- `crud/` — plain functions, not a generic repository layer. Notably:
  - `crud/grades.py::compute_current_grade` — computes a module's current grade as a weighted average across graded assignments (weighted by `weight_percent` when set, else unweighted mean). This is computed on read, not stored.
  - `crud/spaced_repetition.py::apply_review` — SM-2 spaced-repetition algorithm implementation; mutates a `Flashcard`'s `ease_factor`/`interval_days`/`repetitions`/`due_at` in place based on a 0–5 quality rating.
- `api/routes/` — one router module per resource, all included in `main.py`. `calendar.py` is a read-only aggregate endpoint: it merges `Lecture` and `Assignment` (due-date) rows into a unified sorted list of `CalendarEvent`s rather than being backed by its own table.
- `core/config.py` — `pydantic-settings` `Settings`, reads `.env` (not committed). `core/database.py` defines the SQLAlchemy `Base`, `engine`, and the `get_db` FastAPI dependency.

### Data model relationships

`Module` is the root entity (a course). `Lecture`, `Assignment`, `Note`, and `Flashcard` all belong to a `Module`. `Note` optionally belongs to a `Lecture`; `Flashcard` optionally belongs to a `Note` (flashcards can exist standalone within a module). `Note` has many `Attachment`s (uploaded PDFs/PPTX/video/audio files, saved to disk under `backend/uploads/<note_id>/` with a UUID filename — `Attachment.file_path` stores the on-disk path, `Attachment.filename` keeps the original name). `ModuleLink` stores "related modules" as a pair of directed rows (one row is inserted for each direction of a relation).

### Alembic

`alembic/` has not been initialized yet in `backend/`. When setting it up, point `env.py` at `app.core.database.Base.metadata` (after `import app.models` to populate it) and `app.core.config.settings.database_url`, and use `uv run alembic ...` for all migration commands.

### Project status

As of this writing: backend app structure, models, schemas, and routes are scaffolded but no Alembic migration has been generated/run yet, and the database has not been created. The frontend has not been started. Docker was only just made usable on this machine (daemon enabled, user added to the `docker` group) — a new shell/login may be needed for group membership to take effect without `sudo`.
