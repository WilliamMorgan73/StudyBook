const API_BASE = '/api'

export type AssignmentStatus = 'not_started' | 'in_progress' | 'submitted' | 'graded'

export interface ModuleSummary {
  id: number
  name: string
  code: string | null
  color: string
  term: string | null
  credits: number | null
  current_grade: number | null
  next_lecture_at: string | null
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
}

export interface CalendarEvent {
  kind: 'lecture' | 'assignment_due'
  id: number
  module_id: number
  title: string
  starts_at: string
  url: string
}

export interface Lecture {
  id: number
  module_id: number
  title: string
  scheduled_at: string
  location: string | null
  week_number: number | null
}

export interface Note {
  id: number
  module_id: number
  lecture_id: number | null
  title: string
  content_markdown: string
  is_quick_note: boolean
  created_at: string
  updated_at: string
}

export interface Flashcard {
  id: number
  module_id: number
  note_id: number | null
  front: string
  back: string
  due_at: string
}

export interface ModuleDetail extends ModuleSummary {
  lectures: Lecture[]
  assignments: Assignment[]
  notes: Note[]
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

export interface AssignmentCreateInput {
  module_id: number
  title: string
  description?: string | null
  due_at?: string | null
  weight_percent: number
}

export interface NoteCreateInput {
  module_id: number
  title: string
  content_markdown?: string
  is_quick_note?: boolean
  lecture_id?: number | null
}

export interface LectureCreateInput {
  module_id: number
  title: string
  scheduled_at: string
  location?: string | null
  week_number?: number | null
}

export type LectureUpdateInput = Partial<Omit<LectureCreateInput, 'module_id'>>

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

export function listModules() {
  return request<ModuleSummary[]>('/modules')
}

export function getModule(id: number) {
  return request<ModuleDetail>(`/modules/${id}`)
}

export function createModule(input: ModuleCreateInput) {
  return postJson<ModuleSummary>('/modules', input)
}

export function listUpcomingAssignments(limit = 5) {
  return request<Assignment[]>(`/assignments?upcoming=true&limit=${limit}`)
}

export function createAssignment(input: AssignmentCreateInput) {
  return postJson<Assignment>('/assignments', input)
}

export function createNote(input: NoteCreateInput) {
  return postJson<Note>('/notes', input)
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
    start: start.toISOString(),
    end: end.toISOString(),
  })
  return request<CalendarEvent[]>(`/calendar?${params}`)
}
