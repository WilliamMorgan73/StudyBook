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
- `api/routes/` — one router module per resource, all included in `main.py`. `calendar.py` is a read-only aggregate endpoint: it merges `Lecture` and `Assignment` (due-date) rows into a unified sorted list of `CalendarEvent`s rather than being backed by its own table (for lectures it also includes `ends_at`, derived from `duration_minutes`, and `location`, both `None` for assignment-due events). `quick_todos.py` and `quick_note.py` back the Overview page's to-do list and notepad — both are app-wide (no module/assignment scoping), unrelated to the per-assignment `AssignmentTodo`/`notes_markdown`.
- `core/config.py` — `pydantic-settings` `Settings`, reads `.env` (not committed). `core/database.py` defines the SQLAlchemy `Base`, `engine`, and the `get_db` FastAPI dependency.

### Data model relationships

`Module` is the root entity (a course). `Lecture`, `Assignment`, `Submodule`, and `Flashcard` all belong to a `Module`. `Submodule` represents a topic within the module (e.g. "Graph Traversal") and holds one markdown body (`content_markdown`). `Flashcard` optionally belongs to a `Submodule` (flashcards can exist standalone within a module). `ModuleLink` stores "related modules" as a pair of directed rows (one row is inserted for each direction of a relation). `Assignment.weight_percent` is required and the sum of a module's assignment weights is capped at 100% (enforced in `api/routes/assignments.py`, not at the DB level); `Assignment` also has its own `notes_markdown` body, `todos` (`AssignmentTodo`, a simple ordered checklist), and `attachments`.

`AppSettings` and `QuickNote` are both single-row (`id=1`, get-or-create) tables for app-wide state — settings (`max_credits`, `theme_mode`, `skin`) and the Overview page's freeform notepad content, respectively, kept as separate tables since one is configuration and the other is user content. `QuickTodo` is a plain multi-row table (no singleton pattern, no FK) for the Overview page's to-do list.

`Attachment` is polymorphic: `submodule_id` and `assignment_id` are both nullable FKs and exactly one is set, by construction — there are two upload endpoints (`POST /submodules/{id}/attachments`, `POST /assignments/{id}/attachments`), both going through the shared `crud/attachments.py::store_upload`, rather than a DB-level constraint enforcing the XOR. Files are saved to disk under `backend/uploads/submodules/<id>/` or `backend/uploads/assignments/<id>/` (namespaced this way so a submodule and an assignment with the same numeric id can't collide) with a UUID filename; `Attachment.file_path` stores the on-disk path and `Attachment.url` (a computed property, not a column) is what the API exposes for fetching it back — served by the `/uploads` static mount in `main.py`. `DELETE /attachments/{id}` (`api/routes/attachments.py`) removes both the DB row and the on-disk file.

### Alembic

`alembic/` is initialized in `backend/`. `env.py` imports `app.models` (to populate `Base.metadata`) and reads the DB URL from `app.core.config.settings.database_url` rather than `alembic.ini`. Use `uv run alembic ...` for all migration commands, from `backend/`.

### Frontend layout (`frontend/src/`)

- `lib/api.ts` — typed fetch client for the backend (paths are relative, e.g. `/modules`; the Vite dev server proxies `/api/*` to `localhost:8000`, stripping the `/api` prefix — see `vite.config.ts`).
- `lib/useAsync.ts` — small hook wrapping a promise-returning fetcher into `{ data, loading, error }`, re-running when its deps array changes.
- `pages/` — one component per route: `Overview` (`/`), `ModulePage` (`/modules/:moduleId`), `AssignmentPage`, `SubmodulePage`. There is no module-settings route — `ModuleSettingsDialog` (in `components/`) is a modal opened from `ModulePage`, not a page.
- `components/` — page-level building blocks (dialogs, `MonthCalendar`, `CalendarAgenda`, `NextLectureCountdown`, `ModuleSettingsDialog`, `RadialProgress`/`ModuleProgressRing`) plus `components/ui/` for shadcn/ui primitives (generated via `pnpm dlx shadcn@latest add <name>`).
- Recurring lectures are a frontend-only convenience: `ModuleSettingsDialog`'s add-lecture form generates one `Lecture` row per occurrence via repeated `POST /lectures` calls (spaced 7 or 14 days apart) rather than the backend storing a recurrence rule — each occurrence stays independently editable/deletable afterward.
- Module cards and the module page's hero both show `ModuleProgressRing`: a donut built from `assignment_progress` (graded/in_progress/not_started counts, computed server-side in `api/routes/modules.py`) rendered in three opacity shades of the module's own accent color, not a new color.
- The Overview page's calendar day list (`pages/Overview.tsx`) is click-to-expand per event: clicking a day selects it and lists that day's events (as before), and clicking an individual event within that list toggles an inline detail block — start–end time and location for a lecture, a direct link for an assignment due date — tracked by a single `expandedEventKey` string state, reset whenever the selected day changes. That list sits in a fixed-height (`h-24`), independently-scrolling container so expanding an event never changes the Calendar card's own height — necessary because the row uses CSS Grid's default `stretch`, so any card growing taller stretches every card in the row with it.
- The Overview page's top row (`lg:grid-cols-4`) has two 2-card flex columns beside the Calendar: Upcoming assignments + To-do, and a Progress card + Notepad. The Progress ring uses `RadialProgress` directly (not `ModuleProgressRing`, which only takes one color) with a segment per module per status — each module's own accent color at full/`b3`/`4d` alpha for graded/in_progress/not_started, sized by that module's share of the grand total. It fills most of its card (136px) with just the overall completion % as a center label by default; the breakdown (graded/in-progress/not-started counts plus the module-by-module legend) is a second `absolute inset-0` layer that fades in on hover via the `group-hover/card:opacity-100` + `Card`'s own built-in `group/card` class, swapping places with the default label (`group-hover/card:opacity-0`) rather than showing both at once.
- `components/MarkdownEditor.tsx` wraps `@uiw/react-codemirror` (+ `@codemirror/lang-markdown` with `@lezer/markdown`'s `GFM` extensions) to give `SubmodulePage` an Obsidian-style *live preview* editor: a `ViewPlugin` walks the Lezer markdown syntax tree on every doc/selection change and hides formatting marks (`HeaderMark`, `EmphasisMark`, `CodeMark`, `StrikethroughMark`, `QuoteMark`) via `Decoration.replace` on every line except the one the cursor is on, while styling the surrounding node (heading size, bold, italic, inline code, strikethrough, blockquote) unconditionally via `Decoration.mark`/`Decoration.line`. The editor's own `syntaxHighlighting` is turned off in `basicSetup` (its default color scheme clashes with the app's monochrome Nova theme) in favor of these hand-picked classes. `sourceMode` (toggled from `SubmodulePage`'s header) just omits the live-preview `ViewPlugin` from `extensions`, leaving plain-text markdown. There's no separate read-only view anymore — the editor is always live, saving on blur like the rest of the app's inline-edit fields.
  - **Focus tracking is hand-rolled, not `view.hasFocus`/`.cm-focused`**: in this component tree those never reliably toggled, which both hid the cursor permanently and left line 1's marks visible until the first click. Fixed with an explicit `StateField<boolean>` (`focusedField`) updated by a `StateEffect` dispatched from React's `onFocus`/`onBlur` (not CodeMirror's own focus events, and debounced one tick via `setTimeout` — clicking, especially into a blank line, can fire several synchronous focus/blur events before settling, and dispatching on each intermediate one was itself feeding the thrashing since every dispatch recomputes decorations), an `EditorView.editorAttributes` facet that adds a `cm-live-focused` class from that field, and a theme rule keyed off that class (not `.cm-focused`) to show the cursor. `buildDecorations` reads `state.field(focusedField, false)` instead of `view.hasFocus` for the same reason. Theme rules that toggle on a class *of the editor root itself* (like this one) must use `EditorView.theme`'s `&` prefix (`'&.cm-live-focused .cm-cursor'`, matching the existing `'&.cm-editor.cm-focused'` outline-removal rule) — a bare `.cm-live-focused .cm-cursor` selector gets an implicit ancestor scope prepended by `theme()` and can never match, since the scope class and `cm-live-focused` land on the same element rather than one being a descendant of the other.
  - Hiding `HeaderMark`/`QuoteMark` alone leaves their trailing space behind (e.g. "# " → " Heading", a stray gap before the text once the `#` itself disappears) — `skipTrailingSpace` extends the hidden range through that one space too, via `MARK_NODES_CONSUME_TRAILING_SPACE`.
  - The cursor's default 1.2s blink is disabled (`drawSelection({ cursorBlinkRate: 0 })`, added alongside `basicSetup`'s own `drawSelection` — `selectionConfig`'s facet combines multiple `cursorBlinkRate`s with `Math.min`, so 0 always wins regardless of extension order) because a blank line gives the eye nothing else to anchor on, so the normal on/off blink reads as "the cursor is gone" far more often there than on a line sitting next to text.
- `SubmodulePage`'s title is edited inline in the `PageHeader` (click the title to turn it into a text input, Enter/blur to save, Escape to cancel) rather than through the settings dialog — the settings dialog now only holds the delete action.
- **Theming**: `lib/theme.ts` defines `SKINS` (`default`/`slate`/`sepia`, each with light+dark CSS variable blocks in `index.css` under `:root[data-skin="…"]` / `:root[data-skin="…"].dark`) and `applyTheme(mode, skin)`, which toggles the `.dark` class and sets `documentElement.dataset.skin` (resolving `theme_mode: "system"` via `prefers-color-scheme`). `App.tsx` calls `useApplyTheme()` once to apply the persisted `AppSettings` on load and keep "system" mode listening for OS changes. `AppSettingsDialog`'s Appearance tab calls `applyTheme` directly on click (before the PATCH resolves) for instant feedback, and tracks `themeMode`/`skin` in **local state seeded from the `settings` prop**, not read from the prop directly — the dialog's `onChanged` callback drives the same `reloadKey` as the modules list on the Overview page, and `useAsync` nulls its data immediately on every dependency change, so a prop-driven read would flash-unmount the dialog (wrapped in `{appSettings.data && <AppSettingsDialog .../>}`) on every single click. `max_credits` still goes through that reload on save since module cards depend on it; appearance changes don't call `onChanged` at all.
- `AppSettingsDialog` (opened from the Overview page's header) has a category sidebar (Appearance, General, AI Integration, Data) rather than a flat form — General holds `max_credits` (the original single setting), AI Integration and Data are placeholder panels for planned work (see `README.md`'s AI integration section).

### Known quirk: shadcn CLI path alias resolution

This project's Vite template splits `tsconfig.json` into `tsconfig.app.json`/`tsconfig.node.json` via project references; the root `tsconfig.json` only has `references`, no `compilerOptions`. The `shadcn` CLI resolves the `@/*` import alias by reading the root `tsconfig.json` only, so without `paths` duplicated there too, `shadcn add` writes new component files into a literal `./@/` directory instead of `./src/`. The root `tsconfig.json` in this repo already carries a `paths` block for this reason — if `shadcn add` ever creates a stray `frontend/@/` directory again, move its contents into `src/` and delete it.
