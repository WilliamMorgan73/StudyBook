<div align="center">

# 📖 StudyBook

**Your whole semester in one place: notes, deadlines, flashcards and revision plans.**

Markdown notes like Obsidian, courses and deadlines like Notion, spaced repetition like Anki,
with an optional AI study assistant on top. Self-hosted and single-user, and your data stays on your machine.

![React](https://img.shields.io/badge/React_19-20232a?logo=react&logoColor=61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-0f172a?logo=tailwindcss&logoColor=38bdf8)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169e1?logo=postgresql&logoColor=white)
![Claude](https://img.shields.io/badge/Claude-d97757?logo=anthropic&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-8e75b2?logo=googlegemini&logoColor=white)

<img src="docs/screenshots/overview.png" alt="StudyBook Overview dashboard" width="100%">

</div>

---

## ✨ Features

### 🗓️ A dashboard you arrange yourself

The Overview is a grid of widgets that you drag, resize, add and remove:

- **Calendar** with lectures, deadlines, exams, revision sessions and your own busy time
- **Day agenda**, **upcoming assignments** and a **progress ring** that shows how much of each module's grade you've earned
- **Today's revision**, **flashcards due**, a **to-do list** and a scratch **notepad**

<img src="docs/screenshots/edit-layout.png" alt="Editing the dashboard layout" width="100%">

### 📚 Modules, lectures and grades

Each course gets a colour, a credit weighting, a live countdown to the next lecture and a two-week schedule. Recurring lectures (weekly or fortnightly) are entered once. Your **current grade** is a weighted average of everything graded so far.

<img src="docs/screenshots/module.png" alt="Module page" width="100%">

### ✅ Assignments and exams

Each assignment has a weighting (a module's weightings can't add up to more than 100%), a due-date countdown, markdown notes, a checklist and PDF/PPTX attachments. It moves through *not started → submitted → graded*. Exams also store a duration, a location and the topics they cover.

<img src="docs/screenshots/assignment.png" alt="Assignment page" width="100%">

### ✍️ Notes that render as you type

Each topic is a full-page markdown document in an Obsidian-style **live-preview editor**. Headings, tables, code blocks, images and **LaTeX maths** (KaTeX) render inline while you write.

- `[[Wikilinks]]` between topics, with Ctrl/Cmd+click to jump
- Slash-style shortcuts: type `\table3x4`, `\codeblock` or `\image` and press Space
- Keybinds you can rebind, plus adjustable font size and table alignment

<img src="docs/screenshots/notes.png" alt="Live-preview markdown editor with LaTeX and an AI summary" width="100%">

### 🧠 Spaced-repetition flashcards

Flashcards use **SM-2** scheduling (ease factor, interval, due date), the same algorithm Anki is based on. Cards support markdown and maths, can belong to a topic or a whole module, and every review is logged so StudyBook can tell which topics you're weak on.

<img src="docs/screenshots/flashcards.png" alt="Flashcard study session" width="100%">

### 🎯 Revision planner

Pick an exam, the days you can study and how long each session should be. StudyBook then plans sessions in the free gaps around your lectures, other exams and busy time, and gives **more sessions to the topics you keep getting wrong**. Each session lists your weakest cards for that topic.

<table>
  <tr>
    <td><img src="docs/screenshots/revision-plan.png" alt="Revision plan for an exam"></td>
    <td><img src="docs/screenshots/revision-session.png" alt="A revision session with its weakest cards"></td>
  </tr>
</table>

### 🤖 AI study tools (optional, bring your own key)

Add an **Anthropic (Claude)** or **Google (Gemini)** API key in Settings to unlock:

- **Flashcard generation** from a topic's notes and lecture slides, with a review step to accept, edit or reject each card
- **Topic summaries** that show a badge when your notes have changed since the summary was written
- Lecture slides (PDF/PPTX) are converted to text locally first. Before each request you see an estimate of its size, and you can send the original PDF instead when a scanned file has no extractable text

Everything else works without a key.

<img src="docs/screenshots/settings-ai.png" alt="AI integration settings" width="100%">

### 🌗 Themes

Light, dark or follow your system, with three skins (default, slate, sepia).

<img src="docs/screenshots/overview-dark.png" alt="Overview in dark mode" width="100%">

---

## 🛠️ Tech stack

| Layer | Tools |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Radix), React Router, CodeMirror 6, KaTeX, Motion, react-grid-layout |
| **Backend** | Python, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic, markitdown (PDF/PPTX → text) |
| **Database** | PostgreSQL 16 (Docker Compose) |
| **AI** | Anthropic SDK (Claude), Google GenAI SDK (Gemini) |
| **Desktop (optional)** | Tauri |
| **Tooling** | uv, pnpm, pytest, Vitest, Ruff, oxlint |

---

## 🚀 Installation

**Prerequisites:** [Docker](https://www.docker.com/), [uv](https://docs.astral.sh/uv/), [pnpm](https://pnpm.io/) and Node.js.

```bash
git clone https://github.com/WilliamMorgan73/StudyBook.git
cd StudyBook

# 1. Start Postgres
docker compose up -d

# 2. Backend (http://localhost:8000, API docs at /docs)
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# 3. Frontend, in a second terminal (http://localhost:5173)
cd frontend
pnpm install
pnpm dev
```

Then open **http://localhost:5173**.

No `.env` file is needed. The backend's default database URL already matches `docker-compose.yml`. To change settings, create `backend/.env` (see `backend/app/core/config.py`). For example, you can set `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` there instead of entering a key in the app.

### 🖥️ Desktop app (optional)

If you have a Rust toolchain, run this from `frontend/`:

```bash
pnpm tauri dev
```

It opens StudyBook in a native window instead of a browser tab, still connected to the same local backend.

### 🧪 Tests and linting

```bash
cd backend  && uv run pytest && uv run ruff check .
cd frontend && pnpm test && pnpm lint
```

---

## 🗺️ Roadmap

- AI guidance for each revision session
- Replanning when you miss a session
- External calendar feeds (iCal) as busy time
- App-wide search and quick navigation

See [`docs/ai-integration-plan.md`](docs/ai-integration-plan.md) for the AI design. Architecture notes for contributors are in [`docs/agents/`](docs/agents/).
