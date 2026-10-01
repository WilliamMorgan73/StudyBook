# Backend (`backend/app/`)

## Layout

- `models/`: SQLAlchemy 2.0 (`Mapped`/`mapped_column`). Relationships use bare string forward refs (`Mapped["Module"]`) rather than cross-imports, to avoid circular imports. `models/__init__.py` is the one place that imports every model module, so always import via `app.models` before touching `Base.metadata` or querying, or string refs won't resolve.
- `schemas/`: Pydantic request/response models, separate from the ORM models. `ModuleDetail` (`schemas/module.py`) is the module page's aggregate payload: lectures, assignments, submodules, flashcards, related modules, plus computed fields (`current_grade`, `next_lecture_at`, progress) that aren't DB columns.
- `crud/`: plain functions, no generic repository layer.
  - `grades.py::compute_current_grade`: weighted average over graded assignments (by `weight_percent`, else unweighted mean). Computed on read.
  - `grades.py::compute_completion_progress`: `completed_fraction` sums `weight_percent` of `submitted`/`graded` assignments out of the module's full 100%; `achieved_fraction` additionally scales each graded one by `grade_earned/grade_max`. `assignment_progress` (graded/in_progress/not_started counts) is separate, for textual breakdowns.
  - `spaced_repetition.py::apply_review`: SM-2; mutates a `Flashcard`'s `ease_factor`/`interval_days`/`repetitions`/`due_at` in place from a 0–5 quality rating.
  - `spaced_repetition.py::review_card`: `apply_review` plus a new `FlashcardReview` history row (returned for the caller to `db.add`). `POST /flashcards/{id}/review` goes through it, so every review is logged.
- `api/routes/`: one router per resource, all included in `main.py`.
  - `calendar.py` is read-only and table-less: merges `Lecture` and `Assignment` due dates into sorted `CalendarEvent`s. Lectures and exams (`kind="exam"`) carry `ends_at` from `duration_minutes`, and `location`; both are `None` for coursework (`kind="assignment_due"`).
  - `quick_todos.py` / `quick_note.py` back the Overview to-do list and notepad: app-wide, unrelated to per-assignment `AssignmentTodo`/`notes_markdown`.
- `core/config.py`: `pydantic-settings` `Settings` from `.env` (not committed). `core/database.py`: `Base`, `engine`, `get_db` dependency.

## Data model

`Module` (a course) is the root. `Lecture`, `Assignment`, `Submodule` (a topic with one `content_markdown` body) and `Flashcard` belong to a `Module`; a `Flashcard` optionally also belongs to a `Submodule`. `FlashcardReview` is an append-only log of every rating (`quality`, `reviewed_at`), cascade-deleted with its card; the revision planner's weakness scoring will read it. `ModuleLink` stores "related modules" as two directed rows, one per direction.

`Assignment`: `weight_percent` is required, and a module's weights are capped at 100% in `api/routes/assignments.py` (not a DB constraint). It also has `notes_markdown`, ordered `todos` (`AssignmentTodo`) and `attachments`. Status `in_progress` is a valid enum value the UI no longer sets. `kind` is `coursework` (default) or `exam`; exams use `due_at` as the exam start and add nullable `duration_minutes`/`location`, but are otherwise ordinary graded Assignments (weight cap, grade and progress treat them the same). `covered_submodules` (join table `assignment_submodules`, cascade on both sides) lists the Submodules an Assignment covers; ids must belong to the Assignment's own Module, and on create an omitted list defaults to every Submodule for an exam and none for coursework. The revision planner will read exams' covered Submodules.

`AppSettings` and `QuickNote` are single-row get-or-create tables (`id=1`), kept separate because one is configuration and the other user content. `AppSettings` fields are flat scalar columns with Python defaults, including the four `keybind_*` columns, each a raw CodeMirror keymap string (`"Mod-b"`, `"Mod-Shift-k"`). `QuickTodo` is a plain multi-row table.

### Attachments

`Attachment` is polymorphic by construction: `submodule_id` and `assignment_id` are both nullable and exactly one is set, because the only writers are the two upload endpoints (`POST /submodules/{id}/attachments`, `POST /assignments/{id}/attachments`) via `crud/attachments.py::store_upload`. Files go to `backend/uploads/{submodules,assignments}/<id>/<uuid>` (namespaced so equal ids can't collide); `file_path` is the disk path, `url` is a computed property served by the `/uploads` static mount. `DELETE /attachments/{id}` removes row and file.

### Wikilinks

`[[Title]]` / `[[Title|Alias]]` links between submodules are resolved on demand, never stored, and are one-directional by design (a `SubmoduleLink` table plus backlinks panel was built and deliberately removed). `crud/submodule_links.py::resolve_wikilink` supports `"Module Title/Submodule Title"` disambiguation, else prefers a same-module match, else the first match anywhere. `GET /submodules/resolve?title=&module_id=` wraps it and 404s when unresolved. `GET /submodules` is a lightweight cross-module index (`SubmoduleIndexEntry`, optional `search`) for a future link picker.

## Alembic

`alembic/env.py` imports `app.models` and reads the URL from `settings.database_url`, not `alembic.ini`. Run migrations from `backend/` with `uv run alembic ...`.
