# AI integration plan

Agreed design (2026-09-28) for StudyBook's AI features and the non-AI groundwork they depend on. Build order: **0 → 3 → 1 → 2 → 4 → 5**.

## Cross-cutting

- **AI is optional.** Backend exposes `ai_enabled`; without a key, AI buttons are disabled with a tooltip pointing to Settings → AI Integration. Nothing else depends on AI.
- **All calls run in the backend** through one stubbable `services/ai.py`, with an Anthropic (`anthropic` SDK) and a Gemini (`google-genai` SDK) implementation. Features never depend on which provider is selected.
- **API keys**: `AppSettings.anthropic_api_key` and `gemini_api_key` columns, both kept so switching provider needs no re-entry (edited in the AI Integration tab), `.env` fallback (`ANTHROPIC_API_KEY` / `GEMINI_API_KEY`). Write-only over the API: GET returns only `has_anthropic_api_key` / `has_gemini_api_key`.
- **Model**: single `AppSettings.ai_model` setting, default `claude-sonnet-5-5`; it also decides the provider (the list lives in `backend/app/services/ai_models.py`).
- **Budget**: no spend tracking. Show an estimated input size before large requests (whole attachments, raw PDFs).
- **Privacy**: notes may be sent. Lecture files are converted to markdown locally first; raw PDFs are only sent after explicit confirmation.
- **Semantic search**: on hold (Anthropic has no embeddings API; would need a second provider).
- **Tests**: pytest for the revision scheduler, weakness scoring, and ICS parsing. AI layer stubbed; prompts not tested.

## Phase 0 — Study UI + review log (no AI)

- "Study" session on module and submodule pages: front → reveal back → rate → next due card. Uses existing `GET /flashcards/due` and `POST /flashcards/{id}/review`.
- Four rating buttons (Again / Hard / Good / Easy) mapped onto SM-2's 0–5 quality scale.
- New `FlashcardReview` table (`flashcard_id`, `quality`, `reviewed_at`), written by the review endpoint. Ship early so history accumulates.
- Card faces render markdown + KaTeX math (study UI, and later the generation review dialog).

## Phase 3 — Exams + covered submodules (no AI)

- `Assignment.kind` enum: `coursework` | `exam`, exposed as an "This is an exam" toggle in `AddAssignmentDialog` and `AssignmentSettingsDialog` (editable after creation).
- Exam-only nullable fields: `duration_minutes`, `location`. For exams, `due_at` is the exam start.
- Covered-submodules join table on **all** assignments. Default none for coursework, all for exams; flipping the toggle on with none selected prefills all. Coursework use: links between assignment page and topics (future AI context possible).
- `CalendarEvent` gains an `exam` type; exams get a distinct marker in `MonthCalendar`, `ModuleWeekCalendar`, and the Upcoming list.
- Exams stay within the 100% weight cap, `completion_progress`, and the calendar feed like any assignment.

## Phase 1 — Flashcard generation

- AI Integration settings tab: API key + model.
- Attachment → markdown: PDF/PPTX converted on demand with `markitdown`, cached in `Attachment.extracted_markdown`; a "view extracted text" affordance shows what the model receives. Video/audio/images skipped. Near-empty extraction (scanned PDF) → offer to send the raw PDF after confirmation.
- Input: the submodule's `content_markdown` + its converted attachments. (Generate-from-selection is a possible later add.)
- User-chosen card count (default 10, cap ~30). Basic front/back only (no cloze); markdown + `$math$` allowed.
- Existing card fronts for the submodule are sent to avoid duplicates.
- Endpoint returns proposals only; a review dialog lets the user accept / edit / reject each card; accepted cards save through the normal create path.
- New `Flashcard.source` column: `manual` | `ai`.

## Phase 2 — Summaries

- New `Submodule.summary_markdown`, shown in a collapsible block above the editor with a regenerate button.
- `summary_source_hash` (hash of note + extracted attachments at generation time) drives a "notes changed since this summary" nudge. Never auto-regenerates.

## Phase 4 — Busy-time sources (no AI)

- `CalendarFeed` table (name, url, color, enabled) for Google Calendar secret ICS URLs, managed in a new Settings → Calendars tab. Parsed with `icalendar` + `recurring-ical-events`.
- Refresh: when the planner runs/replans, and on calendar view if the cache is older than ~1h, plus a manual Refresh button. Parsed events cached in the DB; a failed fetch falls back to the last good copy with a "last synced X ago" note. No background tasks.
- Native personal events (work, training, …) store a weekly rule (weekdays, start/end time, valid from/until), expanded on read.
- Both sources merge into one "busy intervals" list. Shown muted and toggleable on the Overview `MonthCalendar`; not on `ModuleWeekCalendar`.
- No outbound calendar export (neither ICS feed nor `.ics` download).

## Phase 5 — Revision planner

- "Plan revision" dialog on an exam's page: start date (default today), weekdays, session length.
- Deterministic, tested scheduler decides **when** sessions happen and **which topics** each covers. Avoids lectures, busy intervals, and other exams' existing sessions (each exam planned independently). Topics weighted by recent lapse rate (quality < 3) from `FlashcardReview`, restricted to the exam's covered submodules.
- `RevisionSession` table: exam id, `starts_at`, duration, submodules, `guidance_markdown`, `done`. Shown on the calendars; tickable.
- AI guidance written lazily when a session is opened (using current weakness data), cached on the row. Without a key: the session lists its topics and weakest cards.
- Replanning is manual, prompted when sessions are missed or weak topics shift. It only rewrites future, not-done sessions.
