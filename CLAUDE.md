# CLAUDE.md

StudyBook is a single-user, no-auth study app: Obsidian-style markdown notes, Notion-style modules/assignments/calendar, Anki-style flashcards. See `README.md`.

- **Frontend** (`frontend/`): React + TypeScript, Vite, Tailwind v4 + shadcn/ui (Nova preset, Radix), React Router. `pnpm`.
- **Backend** (`backend/`): FastAPI, SQLAlchemy 2.0, Alembic. `uv`.
- **Database**: Postgres via `docker-compose.yml` (db/user/password all `studybook`, `localhost:5432`).
- **AI**: Anthropic API, planned, not implemented. Design and phase order in `docs/ai-integration-plan.md`.

## Commands

```bash
docker compose up -d                          # repo root: Postgres

# backend/
uv sync
uv run uvicorn app.main:app --reload          # :8000, docs at /docs
uv run pytest [tests/test_file.py::test_name]
uv run ruff check .
uv run alembic revision --autogenerate -m "message"
uv run alembic upgrade head

# frontend/
pnpm install
pnpm dev      # :5173, proxies /api (prefix stripped) and /uploads to :8000
pnpm test     # vitest
pnpm build    # tsc -b && vite build
pnpm lint     # oxlint
```

## Architecture docs

Read the matching doc before working in that area:

- **Backend**, data model, attachments, wikilink resolution, Alembic: `docs/agents/backend.md`
- **Frontend** pages, `useAsync` (refetch, keep-previous-data), lectures, settings dialogs, theming, Tauri shell: `docs/agents/frontend.md`
- **MarkdownEditor** (CodeMirror live preview, widgets, keybinds, slash commands): `docs/agents/markdown-editor.md`

Invariants worth knowing everywhere:

- Import models via `app.models` before touching `Base.metadata` or querying; relationships use string forward refs that only resolve once every model module is registered there.
- Business rules like the 100% assignment-weight cap live in route handlers, not DB constraints.
- Wikilinks are one-directional by design; there is no backlinks table.
- Use Radix `components/ui/select.tsx` for dropdowns; native `<select>` popups can't be themed.

## shadcn CLI path alias quirk

The root `tsconfig.json` only has `references`, but `shadcn` reads the `@/*` alias from it alone, so it carries a duplicated `paths` block. If `shadcn add` ever creates a stray `frontend/@/` directory, move its contents into `src/` and delete it.

## Agent skills

- Issues: GitHub Issues on `WilliamMorgan73/StudyBook` via `gh`. See `docs/agents/issue-tracker.md`.
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- Domain docs: single-context, root `CONTEXT.md` + `docs/adr/` (created lazily). See `docs/agents/domain.md`.
