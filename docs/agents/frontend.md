# Frontend (`frontend/src/`)

For the markdown editor, see [`markdown-editor.md`](markdown-editor.md).

## Layout

- `lib/api.ts`: typed fetch client with relative paths (`/modules`); Vite proxies `/api/*` (prefix stripped) and `/uploads` to `localhost:8000`.
- `lib/useAsync.ts`: `useAsync(fetcher, deps, { keepPreviousData? })` → `{ data, error, loading, refetch }`. Tested in `useAsync.test.ts` (jsdom, `renderHook`).
  - `loading` means "nothing to show yet", so gating a skeleton on it only blanks a first load.
  - `refetch()` re-runs the current fetcher and keeps `data` on screen until the response lands; use it after saves instead of a reload counter. Stable identity (safe as `onChanged={refetch}`); resolves (never rejects) once state is updated.
  - A deps change resets `data` to null (a different resource, e.g. another module id) unless `keepPreviousData: true`, which keeps the old data until the new arrives (Overview calendar months).
  - Only the latest request's result applies; superseded and post-unmount responses are dropped. A failed refresh sets `error` but keeps `data`, so pages treat "no data and not loading" (not `error`) as the failed-first-load state.
- `lib/progress.ts::progressRingSegments`: turns `completion_progress` into the two-arc ring (full accent color for `achieved_fraction`, `4d`-alpha shade for `completed_fraction − achieved_fraction`, unfilled remainder = not submitted). Used by `ModuleProgressRing` and the Overview Progress card.
- `lib/lectureSchedule.ts`: lecture-series helpers for `ModuleSettingsDialog`, including `groupLectures` (see Lectures).
- `pages/`: `Overview` (`/`), `ModulePage` (`/modules/:moduleId`), `AssignmentPage`, `SubmodulePage`. Module/assignment settings are modal dialogs in `components/`, not routes.
- `components/ui/`: shadcn/ui primitives, added with `pnpm dlx shadcn@latest add <name>` (see the path-alias quirk in `CLAUDE.md`).
- Use `components/ui/select.tsx` (Radix), never a native `<select>`: the native dropdown list is OS chrome that CSS can't theme and screenshots can't capture.

## Pages

**Overview.** Top row (`lg:grid-cols-4`): Calendar, then two 2-card columns (Upcoming assignments + To-do; Progress + Notepad).
- Calendar fetch uses `keepPreviousData`, so the previous month stays on screen while the next loads; skeleton only on first load.
- Busy time (`kind="busy"`, from personal events) shows as a muted dash marker (`EventMarker`, which ignores `color` for it), always after other markers in a day cell (`busyLast`). The legend's "Busy" button hides/shows it (`visibleCalendarEvents`), remembered in `localStorage`. Busy events repeat their `id`, so event keys use `calendarEventKey` (kind + id + start). `ModuleWeekCalendar` never shows busy time: it reads `module.lectures`/assignments, not `/calendar`.
- Day list: click a day to list its events, click an event to toggle inline details (tracked by `expandedEventKey`, reset on day change). The list is fixed-height (`h-24`) and scrolls, because the grid row stretches and a taller card would stretch every card in the row.
- Progress ring: `RadialProgress` with one achieved+shortfall pair per module in its own color, sized by credit share (`m.credits ?? 1` fallback). Hover swaps the center label for a breakdown layer via `group-hover/card:` (`Card` has `group/card` built in).

**ModulePage.** Every section is a `Card` (Schedule, Assignments, Submodules, Flashcards, Related modules), using Overview's spacing (`space-y-8 px-8 py-8`, `grid gap-6`) so the two pages match. Schedule is `ModuleWeekCalendar`: read-only, fixed two-week grid (this week + next, Monday start) from `module.lectures`, click a day for its lectures. The hero shows `ModuleProgressRing` and `Countdown`.

**AssignmentPage.** `AssignmentSettingsDialog` holds title/due date/weighting/description/delete. `AssignmentCompletion` owns status as a state machine on `assignment.status`: not_started/in_progress → "Mark complete" (`submitted`) → "Uncomplete" (back to `not_started`, grade cleared) or "Enter grade" (`graded`) → grade display with "Edit grade"/"Uncomplete". `Countdown` is shared with ModulePage via `noneLabel`/`arrivedLabel`.

**SubmodulePage.** Title edits inline in `PageHeader` (Enter/blur saves, Escape cancels); the settings dialog holds only delete.

## Lectures

There is no backend recurrence rule. `ModuleSettingsDialog`'s Lectures tab creates one `Lecture` per occurrence (7 or 14 days apart, max 52) via repeated `POST /lectures`. `groupLectures` re-infers series on read: same title+location on a consistent 7/14-day cadence. Editing a series deletes all its lectures and recreates them.

## Settings dialogs

Both use the same category-sidebar shell.

- `ModuleSettingsDialog` (General, Lectures). The credits field is validated client-side against `max_credits` minus every other module's credits (its own `useAsync` calls); `AddModuleDialog` has no such check.
- `AppSettingsDialog` (Appearance, General, Keybinds, Calendars, AI Integration, Data; Data is a placeholder). Calendars is `PersonalEventsSettings`: add/edit/delete personal events (form logic in `lib/busyTime.ts`); after each change it refetches its own list and calls `onCalendarChanged`, which Overview wires to `calendar.refetch`. Appearance: theme/skin/`table_alignment` apply live on click; `note_font_size` (10–32) commits on blur. Keybinds: one `KeybindInput` per `KEYBIND_ACTIONS` entry; click to record, Escape cancels, `captureKeybind` emits `Mod-Shift-Alt-key` order; shows "Also used by X" on conflicts and a reset button when not default.
- Every `AppSettingsDialog` save calls `onChanged`, which refetches Overview's app settings in place (the dialog stays mounted). Controls read straight from the `settings` prop; only `max_credits` and `note_font_size` keep local drafts, reset each time the dialog opens.
- AI Integration is `AISettingsPanel`: a write-only password input (always starts empty; Save/Remove), a Radix model `Select` fed by `GET /ai/models`, and Test connection (`POST /ai/test`). Its state lives in the dialog's `aiSettings`, updated from each PATCH response and not re-seeded from the (stale) prop on reopen.
- **AI actions** elsewhere use `AIActionButton`: a normal `Button` when `ai_enabled`, otherwise disabled with a tooltip pointing to this tab. Show failures with `lib/ai.ts::aiErrorMessage` (AI errors arrive as `ApiError` with a readable `message` and a `kind`).

## Theming

`lib/theme.ts`: `SKINS` (`default`/`slate`/`sepia`, CSS variables in `index.css` under `:root[data-skin="…"]` and `.dark`) and `applyTheme(mode, skin)`, which toggles `.dark` and sets `data-skin` (resolving `system` via `prefers-color-scheme`). `App.tsx` calls `useApplyTheme()` once. `index.css` also:
- sets `color-scheme: light`/`dark` so native date/time pickers, checkboxes etc. follow the theme;
- hides number-input spinners app-wide;
- styles a thin theme-aware scrollbar (it's the one users see while editing notes, since the editor doesn't scroll internally).

## Desktop shell (`frontend/src-tauri/`)

Optional dev-only Tauri wrapper around the same Vite dev server (`localhost:5173`). `pnpm tauri dev` from `frontend/` (starts the dev server itself; needs a Rust toolchain). `pnpm tauri build` produces `.deb`/`.rpm`; AppImage fails (linuxdeploy needs fuse2) and isn't a current goal.
