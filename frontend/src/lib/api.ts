const API_BASE = '/api'

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
  attachments: Attachment[]
  todos: Todo[]
}

export interface CalendarEvent {
  kind: 'lecture' | 'assignment_due'
  id: number
  module_id: number
  title: string
  starts_at: string
  ends_at: string | null
  location: string | null
  url: string
}

export interface QuickTodo {
  id: number
  text: string
  done: boolean
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

export interface Flashcard {
  id: number
  module_id: number
  submodule_id: number | null
  front: string
  back: string
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
}

export interface ModuleCreateInput {
  name: string
  code?: string | null
  color?: string
  term?: string | null
  credits?: number | null
}

export type ModuleUpdateInput = Partial<ModuleCreateInput>

export interface AssignmentCreateInput {
  module_id: number
  title: string
  description?: string | null
  due_at?: string | null
  weight_percent: number
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = typeof body?.detail === 'string' ? body.detail : null
    throw new Error(detail ?? `${res.status} ${res.statusText}`)
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

export function deleteAttachment(id: number) {
  return request<void>(`/attachments/${id}`, { method: 'DELETE' })
}

export function getSubmodule(id: number) {
  return request<Submodule>(`/submodules/${id}`)
}

export function createSubmodule(input: SubmoduleCreateInput) {
  return postJson<Submodule>('/submodules', input)
}

export function updateSubmodule(id: number, input: SubmoduleUpdateInput) {
  return patchJson<Submodule>(`/submodules/${id}`, input)
}

export function deleteSubmodule(id: number) {
  return request<void>(`/submodules/${id}`, { method: 'DELETE' })
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

export function createFlashcard(input: FlashcardCreateInput) {
  return postJson<Flashcard>('/flashcards', input)
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

export interface AppSettings {
  max_credits: number | null
}

export function getAppSettings() {
  return request<AppSettings>('/settings')
}

export function updateAppSettings(input: Partial<AppSettings>) {
  return patchJson<AppSettings>('/settings', input)
}

export function listQuickTodos() {
  return request<QuickTodo[]>('/quick-todos')
}

export function createQuickTodo(text: string) {
  return postJson<QuickTodo>('/quick-todos', { text })
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
