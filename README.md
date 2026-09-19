# StudyBook

Obsidian × Notion × Anki — a personal study app for organizing courses, lecture schedules, assignments, notes, and spaced-repetition flashcards in one place. Single-user, no auth, self-hosted.

## Features

- **Overview** — a month calendar (lectures and assignment due dates, click a day to see what's on it), an upcoming-assignments list, and a grid of your modules with a live progress ring per module.
- **Modules** (courses) — each has a color, a live countdown to its next lecture, a week/fortnight schedule view, and a current grade computed from graded assignments. Module settings (rename, recolor, delete) live in a single modal, alongside lecture-schedule management.
- **Lectures** — one-off or recurring (weekly/fortnightly, with an end date or occurrence count), each with a start/end time and location. A recurring series shows as one line ("Every Monday at 5:10pm, until 23 Nov — 10 lectures") instead of every individual date.
- **Assignments** — required weighting (the total for a module is capped at 100%), status, grade, a markdown notes section, a checklist, and PDF/PPTX attachments.
- **Submodules** — topics within a module (e.g. "Graph Traversal"), each a full-page markdown document you click into and edit directly in an Obsidian-style live-preview editor (headings, bold/italic/strikethrough, inline code, blockquotes, tables, images, horizontal rules, fenced/indented code blocks, and LaTeX math (`$inline$` / `$$block$$`, via KaTeX) all render inline as you type, with formatting keybinds for bold/italic/code), with its own flashcards and lecture-slide attachments accessible via floating buttons. `[[Wikilink]]` / `[[Title|Alias]]` references to other submodules render inline and Cmd/Ctrl+click-navigate to their target.
- **Flashcards** — SM-2 spaced repetition (ease factor, interval, due date), scoped to a submodule or standalone within a module.
- **A total-credits cap**, set in app settings, that hides the "add module" tile once your course load is full — each module card shows its credits as a share of that cap.

## Tech stack

- **Frontend**: React + TypeScript, Vite, Tailwind v4 + shadcn/ui, React Router — `frontend/`
- **Backend**: FastAPI (Python), SQLAlchemy 2.0, Alembic — `backend/`
- **Database**: PostgreSQL, via `docker-compose.yml`
- **AI integration**: planned (note summarization, note→flashcard generation, revision scheduling, semantic search) — not yet implemented

See `CLAUDE.md` for architecture notes (data model, backend/frontend layout, known quirks).

## Getting started

Prerequisites: [Docker](https://www.docker.com/), [uv](https://docs.astral.sh/uv/), [pnpm](https://pnpm.io/), Node.js.

```bash
# 1. Start Postgres
docker compose up -d

# 2. Backend — from backend/
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload   # http://localhost:8000, docs at /docs

# 3. Frontend — from frontend/, in another terminal
cd frontend
pnpm install
pnpm dev                                # http://localhost:5173
```

The backend's default database URL (`postgresql+psycopg://studybook:studybook@localhost:5432/studybook`) already matches `docker-compose.yml`, so no `.env` file is required for local development — add `backend/.env` only to override settings (see `app/core/config.py`).

### Optional: desktop app

With a Rust toolchain installed, `pnpm tauri dev` (from `frontend/`) opens the same frontend in a native chromeless window instead of a browser tab, still talking to the same local backend — see `CLAUDE.md` for details.

## Status

Backend and frontend are both functional and connected end to end; there's no test suite yet. AI integration and an app-wide search/quick-nav bar are planned but not started.
