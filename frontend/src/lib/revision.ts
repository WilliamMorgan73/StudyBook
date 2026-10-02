import type { RevisionPlanInput, RevisionPlanStatus, RevisionSession } from '@/lib/api'

/** Offered session lengths, in minutes. The backend accepts 15–480. */
export const SESSION_LENGTH_OPTIONS = [30, 45, 60, 90, 120]

export function formatSessionLength(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours} hour${hours === 1 ? '' : 's'}` : `${hours} hours`
}

export interface RevisionPlanFormState {
  /** "YYYY-MM-DD". */
  startDate: string
  weekdays: number[]
  sessionMinutes: number
}

export function defaultRevisionPlanForm(today: string): RevisionPlanFormState {
  return { startDate: today, weekdays: [0, 1, 2, 3, 4], sessionMinutes: 60 }
}

/**
 * The Replan form starts from today and the plan's own settings: the weekdays its sessions fall on and
 * the latest session's length. A plan with no sessions gets the Plan revision defaults.
 */
export function replanForm(
  sessions: Pick<RevisionSession, 'starts_at' | 'duration_minutes'>[],
  today: string,
): RevisionPlanFormState {
  const form = defaultRevisionPlanForm(today)
  if (sessions.length === 0) return form
  const latest = sessions.reduce((a, b) => (b.starts_at > a.starts_at ? b : a))
  // `getDay()` counts from Sunday; the API counts from Monday. `starts_at` is naive local time.
  const weekdays = [...new Set(sessions.map((s) => (new Date(s.starts_at).getDay() + 6) % 7))].sort((a, b) => a - b)
  const sessionMinutes = SESSION_LENGTH_OPTIONS.includes(latest.duration_minutes)
    ? latest.duration_minutes
    : form.sessionMinutes
  return { startDate: today, weekdays, sessionMinutes }
}

/** Why a plan needs replanning, as short phrases: "2 sessions missed", "Graphs got weaker". */
export function replanReasons(status: Pick<RevisionPlanStatus, 'missed_session_ids' | 'shifted_topics'>): string[] {
  const reasons: string[] = []
  const missed = status.missed_session_ids.length
  if (missed > 0) reasons.push(`${missed} session${missed === 1 ? '' : 's'} missed`)
  const titles = (weaker: boolean) =>
    status.shifted_topics.filter((t) => t.weakness > t.planned_weakness === weaker).map((t) => t.title)
  const weaker = titles(true)
  const stronger = titles(false)
  if (weaker.length > 0) reasons.push(`${weaker.join(', ')} got weaker`)
  if (stronger.length > 0) reasons.push(`${stronger.join(', ')} got stronger`)
  return reasons
}

/**
 * Turns the Plan revision form into an API payload, mirroring the backend's checks so errors show inline.
 * Whether the sessions actually fit is only known once the backend has scheduled them.
 */
export function revisionPlanPayload(form: RevisionPlanFormState, examDueAt: string): RevisionPlanInput | { error: string } {
  if (!form.startDate) return { error: 'Pick a start date.' }
  if (form.weekdays.length === 0) return { error: 'Pick at least one weekday to study on.' }
  // ISO dates compare correctly as strings; `due_at` is a naive local datetime.
  if (form.startDate > examDueAt.slice(0, 10)) return { error: 'The start date must be on or before the exam.' }
  return {
    start_date: form.startDate,
    weekdays: [...new Set(form.weekdays)].sort((a, b) => a - b),
    session_minutes: form.sessionMinutes,
  }
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** "Mon, Jun 1, 9:00 AM – 10:00 AM" (locale-formatted). */
export function formatSessionWhen(session: Pick<RevisionSession, 'starts_at' | 'ends_at'>): string {
  const start = new Date(session.starts_at)
  const day = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  return `${day}, ${formatTime(start)} – ${formatTime(new Date(session.ends_at))}`
}

/** The exam page opens a session's view from `?session=`, so calendars can link straight to it. */
export function revisionSessionUrl(session: Pick<RevisionSession, 'id' | 'module_id' | 'assignment_id'>): string {
  return `/modules/${session.module_id}/assignments/${session.assignment_id}?session=${session.id}`
}

/** A word for a Submodule's weakness score (0 = never lapses, 1 = always; 0.5 = no review data). */
export function weaknessLabel(weakness: number): 'Weak' | 'Fair' | 'Strong' {
  if (weakness >= 0.6) return 'Weak'
  if (weakness <= 0.35) return 'Strong'
  return 'Fair'
}
