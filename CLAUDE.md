# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StudyBook is a personal study app combining Obsidian-style markdown notes, Notion-style module/assignment/calendar organization, and Anki-style spaced-repetition flashcards. Single-user, no auth. See `README.md`.

Tech stack:
- **Frontend**: React + TypeScript, Vite, Tailwind v4 + shadcn/ui (Nova preset, Radix primitives), React Router, under `frontend/`
- **Backend**: FastAPI (Python), under `backend/`
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

# Database migrations
uv run alembic revision --autogenerate -m "message"
uv run alembic upgrade head
```

Postgres:
```bash
docker compose up -d       # from repo root; starts Postgres on localhost:5432
```

Frontend commands run from `frontend/` and use `pnpm`:
```bash
pnpm install
pnpm dev     # dev server at http://localhost:5173, proxies /api to localhost:8000
pnpm build   # tsc -b && vite build
pnpm lint    # oxlint
```

## Architecture

### Backend layout (`backend/app/`)

- `models/` — SQLAlchemy 2.0 models (`Mapped`/`mapped_column` style). **Import order matters**: individual model modules use bare string forward refs (e.g. `Mapped["Module"]`) for relationships instead of importing each other, to avoid circular imports. `models/__init__.py` is the single place that imports every model module and registers them with SQLAlchemy's mapper registry — always import models via `app.models` (or ensure `app.models` has been imported) before touching `Base.metadata` or querying, or relationship string refs won't resolve.
- `schemas/` — Pydantic request/response models, separate from SQLAlchemy models. `ModuleDetail` (in `schemas/module.py`) is the aggregate payload for the module page: it composes lectures, assignments, submodules, flashcards, and related modules plus computed fields (`current_grade`, `next_lecture_at`) that don't exist as DB columns.
- `crud/` — plain functions, not a generic repository layer. Notably:
  - `crud/grades.py::compute_current_grade` — computes a module's current grade as a weighted average across graded assignments (weighted by `weight_percent` when set, else unweighted mean). This is computed on read, not stored.
  - `crud/spaced_repetition.py::apply_review` — SM-2 spaced-repetition algorithm implementation; mutates a `Flashcard`'s `ease_factor`/`interval_days`/`repetitions`/`due_at` in place based on a 0–5 quality rating.
- `api/routes/` — one router module per resource, all included in `main.py`. `calendar.py` is a read-only aggregate endpoint: it merges `Lecture` and `Assignment` (due-date) rows into a unified sorted list of `CalendarEvent`s rather than being backed by its own table.
- `core/config.py` — `pydantic-settings` `Settings`, reads `.env` (not committed). `core/database.py` defines the SQLAlchemy `Base`, `engine`, and the `get_db` FastAPI dependency.

### Data model relationships

`Module` is the root entity (a course). `Lecture`, `Assignment`, `Submodule`, and `Flashcard` all belong to a `Module`. `Submodule` represents a topic within the module (e.g. "Graph Traversal") and holds one markdown body (`content_markdown`). `Flashcard` optionally belongs to a `Submodule` (flashcards can exist standalone within a module). `ModuleLink` stores "related modules" as a pair of directed rows (one row is inserted for each direction of a relation). `Assignment.weight_percent` is required and the sum of a module's assignment weights is capped at 100% (enforced in `api/routes/assignments.py`, not at the DB level); `Assignment` also has its own `notes_markdown` body, `todos` (`AssignmentTodo`, a simple ordered checklist), and `attachments`.

`Attachment` is polymorphic: `submodule_id` and `assignment_id` are both nullable FKs and exactly one is set, by construction — there are two upload endpoints (`POST /submodules/{id}/attachments`, `POST /assignments/{id}/attachments`), both going through the shared `crud/attachments.py::store_upload`, rather than a DB-level constraint enforcing the XOR. Files are saved to disk under `backend/uploads/submodules/<id>/` or `backend/uploads/assignments/<id>/` (namespaced this way so a submodule and an assignment with the same numeric id can't collide) with a UUID filename; `Attachment.file_path` stores the on-disk path and `Attachment.url` (a computed property, not a column) is what the API exposes for fetching it back — served by the `/uploads` static mount in `main.py`. `DELETE /attachments/{id}` (`api/routes/attachments.py`) removes both the DB row and the on-disk file.

### Alembic

`alembic/` is initialized in `backend/`. `env.py` imports `app.models` (to populate `Base.metadata`) and reads the DB URL from `app.core.config.settings.database_url` rather than `alembic.ini`. Use `uv run alembic ...` for all migration commands, from `backend/`.

### Frontend layout (`frontend/src/`)

- `lib/api.ts` — typed fetch client for the backend (paths are relative, e.g. `/modules`; the Vite dev server proxies `/api/*` to `localhost:8000`, stripping the `/api` prefix — see `vite.config.ts`).
- `lib/useAsync.ts` — small hook wrapping a promise-returning fetcher into `{ data, loading, error }`, re-running when its deps array changes.
- `pages/` — one component per route: `Overview` (`/`), `ModulePage` (`/modules/:moduleId`), `ModuleSettingsPage` (`/modules/:moduleId/settings`, manages that module's lecture schedule).
- `components/` — page-level building blocks (dialogs, `MonthCalendar`, `CalendarAgenda`, `NextLectureCountdown`) plus `components/ui/` for shadcn/ui primitives (generated via `pnpm dlx shadcn@latest add <name>`).
- Recurring lectures are a frontend-only convenience: the settings page's add-lecture form generates one `Lecture` row per occurrence via repeated `POST /lectures` calls (spaced 7 or 14 days apart) rather than the backend storing a recurrence rule — each occurrence stays independently editable/deletable afterward.

### Known quirk: shadcn CLI path alias resolution

This project's Vite template splits `tsconfig.json` into `tsconfig.app.json`/`tsconfig.node.json` via project references; the root `tsconfig.json` only has `references`, no `compilerOptions`. The `shadcn` CLI resolves the `@/*` import alias by reading the root `tsconfig.json` only, so without `paths` duplicated there too, `shadcn add` writes new component files into a literal `./@/` directory instead of `./src/`. The root `tsconfig.json` in this repo already carries a `paths` block for this reason — if `shadcn add` ever creates a stray `frontend/@/` directory again, move its contents into `src/` and delete it.
