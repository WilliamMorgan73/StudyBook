import type { AssignmentKind } from '@/lib/api'

export interface ExamFormState {
  isExam: boolean
  duration: string
  location: string
}

export type ExamFieldsPayload = {
  kind: AssignmentKind
  duration_minutes: number | null
  location: string | null
}

/**
 * Turns the exam toggle + inputs into API fields. Coursework always clears the exam-only fields,
 * so flipping an exam back to coursework doesn't leave a stale duration/location behind.
 */
export function examFieldsPayload(form: ExamFormState): ExamFieldsPayload | { error: string } {
  if (!form.isExam) return { kind: 'coursework', duration_minutes: null, location: null }
  const trimmed = form.duration.trim()
  const minutes = Number(trimmed)
  if (trimmed && (!Number.isInteger(minutes) || minutes <= 0)) {
    return { error: 'Duration must be a whole number of minutes.' }
  }
  return {
    kind: 'exam',
    duration_minutes: trimmed ? minutes : null,
    location: form.location.trim() || null,
  }
}

export function examEndsAt(startsAt: string, durationMinutes: number | null): Date | null {
  return durationMinutes ? new Date(new Date(startsAt).getTime() + durationMinutes * 60_000) : null
}

/**
 * Covered Submodules after the exam toggle changes. Exams cover the whole Module unless told otherwise,
 * so switching an Assignment to an exam with nothing selected pre-fills every Submodule.
 */
export function coveredAfterExamToggle(wasExam: boolean, isExam: boolean, covered: number[], allSubmoduleIds: number[]) {
  return !wasExam && isExam && covered.length === 0 ? allSubmoduleIds : covered
}
