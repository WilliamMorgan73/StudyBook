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

export type AttachmentKind = 'pdf' | 'pptx' | 'video' | 'audio' | 'image' | 'other'

export interface Attachment {
  id: number
  submodule_id: number
  kind: AttachmentKind
  filename: string
  file_path: string
  url: string
  uploaded_at: string
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

export interface AssignmentCreateInput {
  module_id: number
  title: string
  description?: string | null
  due_at?: string | null
  weight_percent: number
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

export function uploadAttachment(submoduleId: number, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request<Attachment>(`/submodules/${submoduleId}/attachments`, {
    method: 'POST',
    body: formData,
  })
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
    start: start.toISOString(),
    end: end.toISOString(),
  })
  return request<CalendarEvent[]>(`/calendar?${params}`)
}
