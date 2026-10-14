// The "Now" widget (#89): the thing you most likely want, chosen by the time of day. Only the
// app's own lectures, deadlines, exams and revision sessions count, plus cards due; personal and
// calendar-feed (busy) events don't.

import type { CalendarEvent } from '@/lib/api'

/** A lecture counts from this long before it starts. */
export const LECTURE_SOON_MIN = 15
/** A deadline or exam counts from this long before it. */
export const DUE_SOON_HOURS = 48
/** A lecture with no end time is taken to last this long. */
const DEFAULT_LECTURE_MIN = 60

const MIN = 60_000

export type NowItem =
  /** During a lecture (`minutes` left), or `minutes` before it starts. */
  | { kind: 'lecture'; event: CalendarEvent; phase: 'now' | 'soon'; minutes: number }
  /** A revision session today that isn't done. */
  | { kind: 'revision'; event: CalendarEvent }
  /** A deadline or exam within DUE_SOON_HOURS; `minutes` until it (negative once passed). */
  | { kind: 'due'; event: CalendarEvent; minutes: number }
  | { kind: 'cards'; count: number }
  /** Something later today, when nothing above applies. */
  | { kind: 'later'; event: CalendarEvent; minutes: number }

const start = (e: CalendarEvent) => new Date(e.starts_at).getTime()
const end = (e: CalendarEvent) => (e.ends_at ? new Date(e.ends_at).getTime() : start(e) + DEFAULT_LECTURE_MIN * MIN)
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()

/** The window `pickNow` needs events for: from earlier today to DUE_SOON_HOURS ahead. */
export function nowWindow(now: Date): { start: Date; end: Date } {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    end: new Date(now.getTime() + DUE_SOON_HOURS * 60 * MIN + MIN),
  }
}

/**
 * The main item and up to two smaller "next" ones. In order: a lecture on now or within 15
 * minutes, today's revision, something due in the next 48 hours, then cards due, then whatever's
 * left today.
 */
export function pickNow(now: Date, events: readonly CalendarEvent[], dueCards: number): { main: NowItem | null; next: NowItem[] } {
  const t = now.getTime()
  const own = events.filter((e) => e.kind !== 'busy').sort((a, b) => start(a) - start(b))

  const lectures: NowItem[] = own
    .filter((e) => e.kind === 'lecture' && start(e) - LECTURE_SOON_MIN * MIN <= t && t < end(e))
    .map((e) =>
      start(e) <= t
        ? { kind: 'lecture', event: e, phase: 'now', minutes: Math.ceil((end(e) - t) / MIN) }
        : { kind: 'lecture', event: e, phase: 'soon', minutes: Math.ceil((start(e) - t) / MIN) },
    )
  const revision: NowItem[] = own
    .filter((e) => e.kind === 'revision' && !e.done && sameDay(new Date(e.starts_at), now) && end(e) > t)
    .map((e) => ({ kind: 'revision', event: e }))
  const due: NowItem[] = own
    .filter((e) => (e.kind === 'assignment_due' || e.kind === 'exam') && start(e) >= t && start(e) - t <= DUE_SOON_HOURS * 60 * MIN)
    .map((e) => ({ kind: 'due', event: e, minutes: Math.round((start(e) - t) / MIN) }))
  const cards: NowItem[] = dueCards > 0 ? [{ kind: 'cards', count: dueCards }] : []
  const taken = new Set([...lectures, ...revision, ...due].map((i) => ('event' in i ? `${i.event.kind}:${i.event.id}` : '')))
  const later: NowItem[] = own
    .filter((e) => (e.kind === 'lecture' || e.kind === 'revision') && start(e) > t && start(e) < endOfDay(now))
    .filter((e) => !taken.has(`${e.kind}:${e.id}`) && !(e.kind === 'revision' && e.done))
    .map((e) => ({ kind: 'later', event: e, minutes: Math.round((start(e) - t) / MIN) }))

  const ordered = [...lectures, ...revision, ...due, ...cards, ...later]
  return { main: ordered[0] ?? null, next: ordered.slice(1, 3) }
}

/** "5 min", "1 h 20 min", "2 days": a short span for countdowns. */
export function formatSpan(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  if (m < 48 * 60) {
    const h = Math.floor(m / 60)
    const rest = m % 60
    return rest === 0 || h >= 10 ? `${h} h` : `${h} h ${rest} min`
  }
  return `${Math.round(m / (24 * 60))} days`
}
