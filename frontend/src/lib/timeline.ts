// The Deadline timeline widget (#99): a strip of the next few weeks with deadlines and exams placed
// on their dates. Overlapping chips stack in lanes.

import type { Assignment } from '@/lib/api'
import type { WidgetConfigSpec } from '@/lib/dashboardLayout'

export const TIMELINE_WEEKS = [4, 6, 8] as const
export type TimelineWeeks = (typeof TIMELINE_WEEKS)[number]

export interface TimelineConfig extends Record<string, unknown> {
  weeks: TimelineWeeks
}

export const TIMELINE_CONFIG: WidgetConfigSpec<TimelineConfig> = {
  normalize(raw) {
    const weeks = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).weeks : undefined
    return { weeks: TIMELINE_WEEKS.includes(weeks as TimelineWeeks) ? (weeks as TimelineWeeks) : 6 }
  },
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Local midnight on the Monday of `date`'s week. */
export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** The strip: from this week's Monday, `weeks` weeks long. Week starts for the tick labels. */
export function timelineRange(today: Date, weeks: number): { start: Date; end: Date; weekStarts: Date[] } {
  const start = mondayOf(today)
  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(start, i * 7))
  return { start, end: addDays(start, weeks * 7), weekStarts }
}

/** Where `date` falls on the strip, 0 (start) to 1 (end). Local days, so DST shifts don't skew it. */
export function positionOf(date: Date, start: Date, end: Date): number {
  return (date.getTime() - start.getTime()) / (end.getTime() - start.getTime())
}

/** Deadlines that belong on the strip: dated, not yet submitted or graded, within the range. */
export function timelineAssignments(assignments: readonly Assignment[], start: Date, end: Date): Assignment[] {
  return assignments
    .filter((a) => a.due_at !== null && a.status !== 'submitted' && a.status !== 'graded')
    .filter((a) => {
      const at = new Date(a.due_at!).getTime()
      return at >= start.getTime() && at < end.getTime()
    })
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())
}

export interface Placed<T> {
  item: T
  /** 0–1 along the strip. */
  pos: number
  lane: number
}

/**
 * Lanes for chips `width` wide (as a share of the strip) starting at their positions: each goes in
 * the first lane where it doesn't overlap the chip before it. Items must be sorted by position.
 */
export function placeInLanes<T>(items: readonly { item: T; pos: number }[], width: number): Placed<T>[] {
  const laneEnds: number[] = []
  return items.map(({ item, pos }) => {
    // A chip near the right edge is drawn ending at its date instead, so it never overflows.
    const left = Math.min(pos, 1 - width)
    let lane = laneEnds.findIndex((endsAt) => endsAt <= left)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = left + width
    return { item, pos, lane }
  })
}

/** Whole days from `today` to `date` (0 = today), by local date. */
export function daysUntil(date: Date, today: Date): number {
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((b.getTime() - a.getTime()) / DAY_MS)
}
