const API_BASE = '/api'

export type AssignmentKind = 'coursework' | 'exam'

export type AssignmentStatus = 'not_started' | 'in_progress' | 'submitted' | 'graded'

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  graded: 'Graded',
}

export interface ModuleRead {
  id: number
  name: string
  code: string | null
  color: string
  term: string | null
  credits: number | null
}

export interface AssignmentProgress {
  graded: number
  in_progress: number
  not_started: number
  total: number
}

export interface CompletionProgress {
  completed_fraction: number
  achieved_fraction: number
}

export interface ModuleSummary {
  id: number
  name: string
  code: string | null
  color: string
  term: string | null
  credits: number | null
  current_grade: number | null
  next_lecture_at: string | null
  assignment_progress: AssignmentProgress
  completion_progress: CompletionProgress
}

export type AttachmentKind = 'pdf' | 'pptx' | 'video' | 'audio' | 'image' | 'other'

export interface Attachment {
  id: number
  submodule_id: number | null
  assignment_id: number | null
  kind: AttachmentKind
  filename: string
  file_path: string
  url: string
  uploaded_at: string
  /** Null if the stored file has gone missing. */
  size_bytes: number | null
  /** PDF/PPTX that can be converted to markdown for AI features. */
  text_extractable: boolean
}

export interface AttachmentExtractedText {
  attachment_id: number
  kind: AttachmentKind
  /** Exactly the text AI features receive for this Attachment. */
  markdown: string
  /** A PDF that yielded almost no text (likely scanned). */
  near_empty: boolean
}

export interface Todo {
  id: number
  assignment_id: number
  text: string
  done: boolean
  created_at: string
}

export interface Assignment {
  id: number
  module_id: number
  title: string
  description: string | null
  due_at: string | null
  status: AssignmentStatus
  weight_percent: number
  grade_earned: number | null
  grade_max: number | null
  notes_markdown: string
  kind: AssignmentKind
  /** Exam-only; for exams `due_at` is the exam start. */
  duration_minutes: number | null
  location: string | null
  attachments: Attachment[]
  todos: Todo[]
  covered_submodules: { id: number; title: string }[]
}

export interface CalendarEvent {
  /**
   * `busy` = busy time: one occurrence of a PersonalEvent (its `id` repeats across occurrences), or a
   * cached calendar-feed event (`feed_id` set, `id` is the feed event's).
   * `revision` = a RevisionSession; `module_id` is its exam's.
   */
  kind: 'lecture' | 'assignment_due' | 'exam' | 'busy' | 'revision'
  id: number
  /** Null only for `busy`. */
  module_id: number | null
  title: string
  starts_at: string
  ends_at: string | null
  location: string | null
  /** Null only for `busy`. */
  url: string | null
  /** Set only for `revision`. */
  done: boolean | null
  /** Set only for `busy` events from a calendar feed. */
  feed_id: number | null
  /** The calendar feed's colour; set only alongside `feed_id`. */
  color: string | null
  /** Feed events only. Shown on the calendar; never block revision planning. */
  all_day: boolean
}

/** A weekly busy-time rule; expanded into occurrences on read, not stored per occurrence. */
export interface PersonalEvent {
  id: number
  title: string
  /** 0 = Monday ... 6 = Sunday. */
  weekdays: number[]
  /** "HH:MM:SS". An end before the start runs past midnight. */
  start_time: string
  end_time: string
  /** "YYYY-MM-DD", inclusive. */
  valid_from: string
  /** Null = open-ended. */
  valid_until: string | null
  created_at: string
}

export type PersonalEventInput = Omit<PersonalEvent, 'id' | 'created_at'>

/**
 * A subscribed ICS calendar: a Google Calendar secret address, or an uploaded timetable file. Series
 * linked to a module become its lectures; every other event counts as busy time.
 */
export interface CalendarFeed {
  id: number
  name: string
  /** Null for an uploaded file. */
  url: string | null
  source: 'url' | 'file'
  color: string
  enabled: boolean
  /** UTC, naive. The last successful fetch; null until the first. */
  last_synced_at: string | null
  /** Why the latest fetch failed (the cached events are still used); null after a success. */
  last_error: string | null
  /** Cached busy events (series not linked to a module). */
  event_count: number
  linked_lecture_count: number
  created_at: string
}

export interface CalendarFeedInput {
  name: string
  url: string
  color: string
  enabled: boolean
}

/** One event series in a feed: every timed event with this exact title. */
export interface FeedSeries {
  title: string
  count: number
  first_starts_at: string
  location: string | null
  /** The module the series is linked to (its events are that module's lectures), or null (busy time). */
  module_id: number | null
}

export interface RevisionPlanInput {
  /** "YYYY-MM-DD". */
  start_date: string
  /** 0 = Monday ... 6 = Sunday. */
  weekdays: number[]
  session_minutes: number
}

/** A planned block of revision for an exam. */
export interface RevisionSession {
  id: number
  assignment_id: number
  module_id: number
  exam_title: string
  starts_at: string
  ends_at: string
  duration_minutes: number
  done: boolean
  /** AI guidance, written when the session is first opened with AI enabled. Null until then. */
  guidance_markdown: string | null
  submodules: { id: number; title: string }[]
}

/** Whether an exam's revision plan has drifted since it was last made or replanned. */
export interface RevisionPlanStatus {
  needs_replan: boolean
  planned_at: string | null
  /** Sessions that ended without being ticked done. */
  missed_session_ids: number[]
  /** Covered topics whose weakness (0 = never lapses, 1 = always) has moved enough to rebalance the plan. */
  shifted_topics: { id: number; title: string; planned_weakness: number; weakness: number }[]
}

export interface RevisionSessionDetail extends RevisionSession {
  /** `weakness`: 0 (never lapses) to 1 (always lapses); 0.5 with no review data. */
  topics: { id: number; title: string; weakness: number }[]
  /** Reviewed cards in the session's topics, highest recent lapse rate first. */
  weakest_cards: {
    id: number
    submodule_id: number | null
    front: string
    back: string
    lapse_rate: number
    review_count: number
  }[]
}

export interface QuickTodo {
  id: number
  text: string
  done: boolean
  /** Null: a General to-do, not tied to a module. */
  module_id: number | null
  created_at: string
}

export interface QuickNote {
  content: string | null
}

export interface Lecture {
  id: number
  module_id: number
  title: string
  scheduled_at: string
  duration_minutes: number | null
  location: string | null
  week_number: number | null
  /** Set when synced from a calendar feed's linked series; such lectures are read-only. */
  feed_id: number | null
}

export interface Submodule {
  id: number
  module_id: number
  title: string
  content_markdown: string
  created_at: string
  updated_at: string
  attachments: Attachment[]
}

/** A single Submodule as its own endpoints return it: with its AI summary. */
export interface SubmoduleDetail extends Submodule {
  /** Generated on request only; never regenerated automatically. */
  summary_markdown: string | null
  /** The note or Attachments changed since the summary was generated (false with no summary). */
  summary_stale: boolean
}

export interface SubmoduleIndexEntry {
  id: number
  title: string
  module_id: number
  module_name: string
}

/** `ai` = generated and accepted in the review dialog. */
export type FlashcardSource = 'manual' | 'ai'

export interface Flashcard {
  id: number
  module_id: number
  submodule_id: number | null
  front: string
  back: string
  source: FlashcardSource
  ease_factor: number
  interval_days: number
  repetitions: number
  due_at: string
  last_reviewed_at: string | null
}

export interface ModuleDetail extends ModuleSummary {
  lectures: Lecture[]
  assignments: Assignment[]
  submodules: Submodule[]
  flashcards: Flashcard[]
  related_modules: { id: number; name: string }[]
  /** Null: `MODULE_DEFAULT_LAYOUT`. Read it through `lib/dashboardLayout.ts::normalizeLayout`. */
  dashboard_layout: DashboardLayoutItem[] | null
  /** The module page's notepad. */
  notes: string | null
  /** Null: `DEFAULT_BANNER`. Read it through `lib/moduleBanner.ts::normalizeBanner`. */
  banner: ModuleBannerConfig | null
}

export interface ModuleBannerConfig {
  /** Stat ids, in order; see `lib/moduleBanner.ts`. */
  stats: string[]
  ring: boolean
  tint: 'none' | 'soft' | 'strong'
  size: 'compact' | 'comfortable'
}

export interface ModuleCreateInput {
  name: string
  code?: string | null
  color?: string
  term?: string | null
  credits?: number | null
}

export type ModuleUpdateInput = Partial<ModuleCreateInput> & {
  /** A list sets the module page's layout; null resets it to the default. */
  dashboard_layout?: DashboardLayoutItem[] | null
  notes?: string | null
  /** A config sets the banner; null resets it to the default. */
  banner?: ModuleBannerConfig | null
}

export interface AssignmentCreateInput {
  module_id: number
  title: string
  description?: string | null
  due_at?: string | null
  weight_percent: number
  kind?: AssignmentKind
  duration_minutes?: number | null
  location?: string | null
  /** Omit on create for the default: every Submodule for an exam, none for coursework. */
  covered_submodule_ids?: number[]
}

export type AssignmentUpdateInput = Partial<Omit<AssignmentCreateInput, 'module_id'>> & {
  status?: AssignmentStatus
  grade_earned?: number | null
  grade_max?: number | null
  notes_markdown?: string
}

export interface SubmoduleCreateInput {
  module_id: number
  title: string
  content_markdown?: string
}

export type SubmoduleUpdateInput = Partial<Omit<SubmoduleCreateInput, 'module_id'>>

export interface FlashcardCreateInput {
  module_id: number
  submodule_id?: number | null
  front: string
  back: string
  /** Defaults to `manual` on the backend. */
  source?: FlashcardSource
}

/** One extractable Attachment in a Submodule's AI source material. */
export interface SourceAttachment {
  attachment_id: number
  filename: string
  kind: AttachmentKind
  /** A PDF that yielded almost no text; the original can be sent instead after opting in. */
  near_empty: boolean
  send_raw_pdf: boolean
  /** As it would be sent now (0 when extraction failed). */
  estimated_tokens: number
  /** Near-empty PDFs only: the estimated cost of sending the original. */
  raw_pdf_estimated_tokens: number | null
  /** Extraction failed; the file is left out. */
  error: string | null
}

/** What an AI feature would send for a Submodule (note + Attachment text) and its rough size. */
export interface SubmoduleSourceEstimate {
  submodule_id: number
  note_estimated_tokens: number
  estimated_tokens: number
  large: boolean
  large_threshold_tokens: number
  /** Nothing to send: blank note and no usable Attachments. */
  is_empty: boolean
  attachments: SourceAttachment[]
}

export interface FlashcardProposal {
  front: string
  back: string
}

export interface LectureCreateInput {
  module_id: number
  title: string
  scheduled_at: string
  duration_minutes?: number | null
  location?: string | null
  week_number?: number | null
}

export type LectureUpdateInput = Partial<Omit<LectureCreateInput, 'module_id'>>

/**
 * Formats a Date's local wall-clock components as a naive datetime string
 * ("YYYY-MM-DDTHH:MM:SS", no timezone). The backend stores/returns naive timestamps and
 * the app reads them back with `new Date(iso)`, which treats a string with no timezone
 * suffix as local time - so writes must never go through `.toISOString()` (UTC). Doing so
 * shifts the stored value by the browser's UTC offset, and since that offset moves with
 * DST, the shift isn't even constant across a series of dates.
 */
export function toNaiveDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * A non-2xx API response. `message` is the backend's `detail` when it sent a string one. `kind`
 * is set on AI failures (see `lib/ai.ts`), whose `detail` is already a readable message.
 */
export class ApiError extends Error {
  readonly status: number
  readonly kind: string | null

  constructor(message: string, status: number, kind: string | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.kind = kind
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = typeof body?.detail === 'string' ? body.detail : null
    const kind = typeof body?.kind === 'string' ? body.kind : null
    throw new ApiError(detail ?? `${res.status} ${res.statusText}`, res.status, kind)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function patchJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function uploadFile<T>(path: string, file: File): Promise<T> {
  const formData = new FormData()
  formData.append('file', file)
  return request<T>(path, { method: 'POST', body: formData })
}

export function listModules() {
  return request<ModuleSummary[]>('/modules')
}

export function getModule(id: number) {
  return request<ModuleDetail>(`/modules/${id}`)
}

export function createModule(input: ModuleCreateInput) {
  return postJson<ModuleSummary>('/modules', input)
}

export function updateModule(id: number, input: ModuleUpdateInput) {
  return patchJson<ModuleRead>(`/modules/${id}`, input)
}

export function deleteModule(id: number) {
  return request<void>(`/modules/${id}`, { method: 'DELETE' })
}

export function listUpcomingAssignments(limit = 5) {
  return request<Assignment[]>(`/assignments?upcoming=true&limit=${limit}`)
}

export function getAssignment(id: number) {
  return request<Assignment>(`/assignments/${id}`)
}

export function createAssignment(input: AssignmentCreateInput) {
  return postJson<Assignment>('/assignments', input)
}

export function updateAssignment(id: number, input: AssignmentUpdateInput) {
  return patchJson<Assignment>(`/assignments/${id}`, input)
}

export function deleteAssignment(id: number) {
  return request<void>(`/assignments/${id}`, { method: 'DELETE' })
}

export function uploadAssignmentAttachment(assignmentId: number, file: File) {
  return uploadFile<Attachment>(`/assignments/${assignmentId}/attachments`, file)
}

export function createTodo(assignmentId: number, text: string) {
  return postJson<Todo>(`/assignments/${assignmentId}/todos`, { text })
}

export function updateTodo(assignmentId: number, todoId: number, input: { text?: string; done?: boolean }) {
  return patchJson<Todo>(`/assignments/${assignmentId}/todos/${todoId}`, input)
}

export function deleteTodo(assignmentId: number, todoId: number) {
  return request<void>(`/assignments/${assignmentId}/todos/${todoId}`, { method: 'DELETE' })
}

export function getAttachmentExtractedText(id: number) {
  return request<AttachmentExtractedText>(`/attachments/${id}/extracted-text`)
}

export function deleteAttachment(id: number) {
  return request<void>(`/attachments/${id}`, { method: 'DELETE' })
}

export function getSubmodule(id: number) {
  return request<SubmoduleDetail>(`/submodules/${id}`)
}

export function createSubmodule(input: SubmoduleCreateInput) {
  return postJson<SubmoduleDetail>('/submodules', input)
}

export function updateSubmodule(id: number, input: SubmoduleUpdateInput) {
  return patchJson<SubmoduleDetail>(`/submodules/${id}`, input)
}

export function deleteSubmodule(id: number) {
  return request<void>(`/submodules/${id}`, { method: 'DELETE' })
}

export function listSubmodulesIndex(search?: string) {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  return request<SubmoduleIndexEntry[]>(`/submodules?${params}`)
}

export function resolveWikilink(title: string, moduleId: number) {
  const params = new URLSearchParams({ title, module_id: String(moduleId) })
  return request<{ id: number; module_id: number }>(`/submodules/resolve?${params}`)
}

export function uploadSubmoduleAttachment(submoduleId: number, file: File) {
  return uploadFile<Attachment>(`/submodules/${submoduleId}/attachments`, file)
}

export function listFlashcards(filter: { moduleId?: number; submoduleId?: number }) {
  const params = new URLSearchParams()
  if (filter.moduleId !== undefined) params.set('module_id', String(filter.moduleId))
  if (filter.submoduleId !== undefined) params.set('submodule_id', String(filter.submoduleId))
  return request<Flashcard[]>(`/flashcards?${params}`)
}

export function listDueFlashcards(scope: { moduleId?: number; submoduleId?: number }) {
  const params = new URLSearchParams()
  if (scope.moduleId !== undefined) params.set('module_id', String(scope.moduleId))
  if (scope.submoduleId !== undefined) params.set('submodule_id', String(scope.submoduleId))
  return request<Flashcard[]>(`/flashcards/due?${params}`)
}

/** `quality` is SM-2's 0–5 recall rating; >=3 counts as correct. */
export function reviewFlashcard(id: number, quality: number) {
  return postJson<Flashcard>(`/flashcards/${id}/review`, { quality })
}

export function createFlashcard(input: FlashcardCreateInput) {
  return postJson<Flashcard>('/flashcards', input)
}

/**
 * Estimates a Submodule's AI source material. Converts its Attachments on first use, so it can
 * take a few seconds. `rawPdfIds` are near-empty PDFs to send as the original file instead.
 */
export function getSubmoduleAISource(submoduleId: number, rawPdfIds: number[] = []) {
  const params = new URLSearchParams()
  for (const id of rawPdfIds) params.append('raw_pdf_ids', String(id))
  return request<SubmoduleSourceEstimate>(`/submodules/${submoduleId}/ai-source?${params}`)
}

/** Proposals only; nothing is saved. Accepted cards go through `createFlashcard` with `source: 'ai'`. */
export function generateFlashcards(submoduleId: number, input: { count: number; raw_pdf_ids: number[] }) {
  return postJson<{ proposals: FlashcardProposal[] }>(`/submodules/${submoduleId}/flashcards/generate`, input)
}

/** Generates (or regenerates) and stores the Submodule's summary; returns the updated Submodule. */
export function summarizeSubmodule(submoduleId: number, input: { raw_pdf_ids: number[] }) {
  return postJson<SubmoduleDetail>(`/submodules/${submoduleId}/summary`, input)
}

export function deleteFlashcard(id: number) {
  return request<void>(`/flashcards/${id}`, { method: 'DELETE' })
}

export function listLectures(moduleId: number) {
  return request<Lecture[]>(`/lectures?module_id=${moduleId}`)
}

export function createLecture(input: LectureCreateInput) {
  return postJson<Lecture>('/lectures', input)
}

export function updateLecture(id: number, input: LectureUpdateInput) {
  return patchJson<Lecture>(`/lectures/${id}`, input)
}

export function deleteLecture(id: number) {
  return request<void>(`/lectures/${id}`, { method: 'DELETE' })
}

export function getCalendar(start: Date, end: Date) {
  const params = new URLSearchParams({
    start: toNaiveDateTime(start),
    end: toNaiveDateTime(end),
  })
  return request<CalendarEvent[]>(`/calendar?${params}`)
}

/** Rejects with an `ApiError` whose message explains when there isn't enough time. */
export function createRevisionPlan(assignmentId: number, input: RevisionPlanInput) {
  return postJson<RevisionSession[]>(`/assignments/${assignmentId}/revision-plan`, input)
}

/**
 * Keeps sessions that are done or already started and reschedules the rest; resolves to the whole plan.
 * Rejects like `createRevisionPlan`, leaving the plan unchanged.
 */
export function replanRevision(assignmentId: number, input: RevisionPlanInput) {
  return postJson<RevisionSession[]>(`/assignments/${assignmentId}/revision-plan/replan`, input)
}

export function getRevisionPlanStatus(assignmentId: number) {
  return request<RevisionPlanStatus>(`/assignments/${assignmentId}/revision-plan/status`)
}

export function deleteRevisionPlan(assignmentId: number) {
  return request<void>(`/assignments/${assignmentId}/revision-plan`, { method: 'DELETE' })
}

export function listRevisionSessions(filter: { assignmentId?: number; moduleId?: number; start?: Date; end?: Date }) {
  const params = new URLSearchParams()
  if (filter.assignmentId !== undefined) params.set('assignment_id', String(filter.assignmentId))
  if (filter.moduleId !== undefined) params.set('module_id', String(filter.moduleId))
  if (filter.start) params.set('start', toNaiveDateTime(filter.start))
  if (filter.end) params.set('end', toNaiveDateTime(filter.end))
  return request<RevisionSession[]>(`/revision-sessions?${params}`)
}

export function getRevisionSession(id: number) {
  return request<RevisionSessionDetail>(`/revision-sessions/${id}`)
}

export function updateRevisionSession(id: number, input: { done?: boolean }) {
  return patchJson<RevisionSession>(`/revision-sessions/${id}`, input)
}

export function listPersonalEvents() {
  return request<PersonalEvent[]>('/personal-events')
}

export function createPersonalEvent(input: PersonalEventInput) {
  return postJson<PersonalEvent>('/personal-events', input)
}

export function updatePersonalEvent(id: number, input: Partial<PersonalEventInput>) {
  return patchJson<PersonalEvent>(`/personal-events/${id}`, input)
}

export function deletePersonalEvent(id: number) {
  return request<void>(`/personal-events/${id}`, { method: 'DELETE' })
}

export function listCalendarFeeds() {
  return request<CalendarFeed[]>('/calendar-feeds')
}

/** Saves the feed and syncs it straight away; a failed first sync still saves it, with `last_error` set. */
export function createCalendarFeed(input: CalendarFeedInput) {
  return postJson<CalendarFeed>('/calendar-feeds', input)
}

export function updateCalendarFeed(id: number, input: Partial<CalendarFeedInput>) {
  return patchJson<CalendarFeed>(`/calendar-feeds/${id}`, input)
}

export function deleteCalendarFeed(id: number) {
  return request<void>(`/calendar-feeds/${id}`, { method: 'DELETE' })
}

/** Syncs the feed now. A failure still resolves, with `last_error` set and the cached events kept. */
export function refreshCalendarFeed(id: number) {
  return postJson<CalendarFeed>(`/calendar-feeds/${id}/refresh`, {})
}

/** Creates a feed from an uploaded .ics file, e.g. a downloaded university timetable. */
export function uploadCalendarFeed(input: { name: string; color: string; file: File }) {
  const formData = new FormData()
  formData.append('name', input.name)
  formData.append('color', input.color)
  formData.append('file', input.file)
  return request<CalendarFeed>('/calendar-feeds/upload', { method: 'POST', body: formData })
}

/** Replaces an uploaded feed's file; linked lectures are updated in place. */
export function replaceCalendarFeedFile(id: number, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request<CalendarFeed>(`/calendar-feeds/${id}/file`, { method: 'PUT', body: formData })
}

export function listFeedSeries(id: number) {
  return request<FeedSeries[]>(`/calendar-feeds/${id}/series`)
}

/** Replaces the feed's series → module links; titles not listed are unlinked (back to busy time). */
export function setFeedLinks(id: number, links: { title: string; module_id: number | null }[]) {
  return request<CalendarFeed>(`/calendar-feeds/${id}/links`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(links),
  })
}

/** Syncs every enabled feed not synced in the last hour; `refreshed` counts the successes. */
export function refreshStaleCalendarFeeds() {
  return postJson<{ refreshed: number }>('/calendar-feeds/refresh-stale', {})
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type Skin = 'default' | 'slate' | 'sepia'
export type TableAlignment = 'left' | 'center'

/** One dashboard widget (Overview or module page) on the 12-column grid. Read it through `lib/dashboardLayout.ts::normalizeLayout`. */
export interface DashboardLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

export interface AppSettings {
  max_credits: number | null
  theme_mode: ThemeMode
  skin: Skin
  table_alignment: TableAlignment
  note_font_size: number
  keybind_bold: string
  keybind_italic: string
  keybind_code: string
  keybind_wikilink: string
  ai_model: string
  /** Null: the default Overview layout. */
  dashboard_layout: DashboardLayoutItem[] | null
  /** Derived from `ai_model`. */
  ai_provider: AIProvider
  /** A key is saved in settings. The keys themselves are write-only and never sent back. */
  has_anthropic_api_key: boolean
  has_gemini_api_key: boolean
  /** The selected provider has a key (saved, or set in the backend environment), so AI actions work. */
  ai_enabled: boolean
}

export type AppSettingsUpdate = Partial<
  Omit<AppSettings, 'ai_provider' | 'has_anthropic_api_key' | 'has_gemini_api_key' | 'ai_enabled'>
> & {
  /** Write-only: a string sets the key, `null` clears it, omitted leaves it unchanged. */
  anthropic_api_key?: string | null
  gemini_api_key?: string | null
}

export function getAppSettings() {
  return request<AppSettings>('/settings')
}

export function updateAppSettings(input: AppSettingsUpdate) {
  return patchJson<AppSettings>('/settings', input)
}

export type AIProvider = 'anthropic' | 'gemini'

export interface AIModelOption {
  id: string
  label: string
  description: string
  provider: AIProvider
}

export function listAIModels() {
  return request<AIModelOption[]>('/ai/models')
}

/** Checks the saved key against the selected model. Rejects with an `ApiError` on failure. */
export function testAIConnection() {
  return request<{ ok: true; model: string }>('/ai/test', { method: 'POST' })
}

/** Every to-do, or with `moduleId` only that module's. */
export function listQuickTodos(filter: { moduleId?: number } = {}) {
  const params = new URLSearchParams()
  if (filter.moduleId !== undefined) params.set('module_id', String(filter.moduleId))
  return request<QuickTodo[]>(`/quick-todos?${params}`)
}

/** A General to-do, or one in `moduleId`'s list. */
export function createQuickTodo(text: string, moduleId: number | null = null) {
  return postJson<QuickTodo>('/quick-todos', { text, module_id: moduleId })
}

export function updateQuickTodo(id: number, input: { text?: string; done?: boolean }) {
  return patchJson<QuickTodo>(`/quick-todos/${id}`, input)
}

export function deleteQuickTodo(id: number) {
  return request<void>(`/quick-todos/${id}`, { method: 'DELETE' })
}

export function getQuickNote() {
  return request<QuickNote>('/quick-note')
}

export function updateQuickNote(content: string) {
  return patchJson<QuickNote>('/quick-note', { content })
}
