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

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${path}`)
  }
  return res.json() as Promise<T>
}

export function listModules() {
  return request<ModuleSummary[]>('/modules')
}

export function listUpcomingAssignments(limit = 5) {
  return request<Assignment[]>(`/assignments?upcoming=true&limit=${limit}`)
}

export function getCalendar(start: Date, end: Date) {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
  })
  return request<CalendarEvent[]>(`/calendar?${params}`)
}
