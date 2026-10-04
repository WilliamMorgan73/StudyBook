import type { CalendarEvent, PersonalEvent, PersonalEventInput } from '@/lib/api'

/** Indexed like the backend's weekdays: 0 = Monday ... 6 = Sunday. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function formatWeekdays(weekdays: number[]): string {
  const days = [...new Set(weekdays)].sort((a, b) => a - b)
  const key = days.join(',')
  if (key === '0,1,2,3,4,5,6') return 'Every day'
  if (key === '0,1,2,3,4') return 'Weekdays'
  if (key === '5,6') return 'Weekends'
  return days.map((d) => WEEKDAY_LABELS[d]).join(', ')
}

/** "HH:MM:SS" or "HH:MM" -> "HH:MM", the `<input type="time">` format. */
export function timeInputValue(time: string): string {
  return time.slice(0, 5)
}

export interface PersonalEventFormState {
  title: string
  weekdays: number[]
  startTime: string
  endTime: string
  validFrom: string
  /** Empty = open-ended. */
  validUntil: string
}

export function personalEventFormState(event: PersonalEvent | undefined, today: string): PersonalEventFormState {
  if (!event) return { title: '', weekdays: [], startTime: '', endTime: '', validFrom: today, validUntil: '' }
  return {
    title: event.title,
    weekdays: event.weekdays,
    startTime: timeInputValue(event.start_time),
    endTime: timeInputValue(event.end_time),
    validFrom: event.valid_from,
    validUntil: event.valid_until ?? '',
  }
}

/**
 * Turns the personal-event form into an API payload, mirroring the backend's checks so errors show
 * inline. An end time before the start time is allowed: it means the event runs past midnight.
 */
export function personalEventPayload(form: PersonalEventFormState): PersonalEventInput | { error: string } {
  const title = form.title.trim()
  if (!title) return { error: 'Title is required.' }
  if (form.weekdays.length === 0) return { error: 'Pick at least one weekday.' }
  if (!form.startTime || !form.endTime) return { error: 'Start and end times are required.' }
  if (form.startTime === form.endTime) return { error: 'End time must differ from start time.' }
  if (!form.validFrom) return { error: 'Valid-from date is required.' }
  // ISO dates compare correctly as strings.
  if (form.validUntil && form.validUntil < form.validFrom) return { error: "Valid-until can't be before valid-from." }
  return {
    title,
    weekdays: [...new Set(form.weekdays)].sort((a, b) => a - b),
    start_time: form.startTime,
    end_time: form.endTime,
    valid_from: form.validFrom,
    valid_until: form.validUntil || null,
  }
}

export function toggleWeekday(weekdays: number[], day: number): number[] {
  return weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day].sort((a, b) => a - b)
}

/**
 * Unique per occurrence: personal busy events share their PersonalEvent's `id` across occurrences,
 * and calendar-feed events number separately from PersonalEvents.
 */
export function calendarEventKey(event: CalendarEvent): string {
  return `${event.feed_id != null ? 'feed' : event.kind}-${event.id}-${event.starts_at}`
}

export function visibleCalendarEvents(events: CalendarEvent[], showBusy: boolean): CalendarEvent[] {
  return showBusy ? events : events.filter((e) => e.kind !== 'busy')
}

/**
 * Busy events moved after everything else, each group keeping its order, so a day cell's limited
 * marker slots never let muted busy markers crowd out lectures and deadlines.
 */
export function busyLast(events: CalendarEvent[]): CalendarEvent[] {
  return [...events.filter((e) => e.kind !== 'busy'), ...events.filter((e) => e.kind === 'busy')]
}
