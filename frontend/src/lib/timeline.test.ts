import { describe, expect, it } from 'vitest'

import type { Assignment } from '@/lib/api'
import { daysUntil, mondayOf, placeInLanes, positionOf, TIMELINE_CONFIG, timelineAssignments, timelineRange } from '@/lib/timeline'

const assignment = (id: number, due_at: string | null, status: Assignment['status'] = 'not_started'): Assignment =>
  ({ id, module_id: 1, title: `A${id}`, due_at, status, kind: 'coursework' }) as Assignment

describe('TIMELINE_CONFIG', () => {
  it('defaults to six weeks and keeps 4, 6 or 8', () => {
    expect(TIMELINE_CONFIG.normalize(undefined)).toEqual({ weeks: 6 })
    expect(TIMELINE_CONFIG.normalize({ weeks: 8 })).toEqual({ weeks: 8 })
    expect(TIMELINE_CONFIG.normalize({ weeks: 5 })).toEqual({ weeks: 6 })
  })
})

describe('timelineRange', () => {
  it("starts on this week's Monday and runs whole weeks", () => {
    const wed = new Date(2026, 9, 14, 15, 30)
    expect(mondayOf(wed)).toEqual(new Date(2026, 9, 12))
    expect(mondayOf(new Date(2026, 9, 18))).toEqual(new Date(2026, 9, 12)) // Sunday
    const { start, end, weekStarts } = timelineRange(wed, 4)
    expect(start).toEqual(new Date(2026, 9, 12))
    expect(end).toEqual(new Date(2026, 10, 9))
    expect(weekStarts).toHaveLength(4)
    expect(weekStarts[1]).toEqual(new Date(2026, 9, 19))
    expect(positionOf(new Date(2026, 9, 26), start, end)).toBeCloseTo(0.5, 2)
  })
})

describe('timelineAssignments', () => {
  it('keeps dated, unfinished deadlines inside the range, by date', () => {
    const { start, end } = timelineRange(new Date(2026, 9, 14), 4)
    const items = timelineAssignments(
      [
        assignment(1, '2026-10-30T12:00:00'),
        assignment(2, '2026-10-20T12:00:00'),
        assignment(3, '2026-10-21T12:00:00', 'submitted'),
        assignment(4, null),
        assignment(5, '2026-12-01T12:00:00'),
        assignment(6, '2026-10-01T12:00:00'),
      ],
      start,
      end,
    )
    expect(items.map((a) => a.id)).toEqual([2, 1])
  })
})

describe('placeInLanes', () => {
  it('stacks overlapping chips and reuses lanes once there is room', () => {
    const placed = placeInLanes(
      [
        { item: 'a', pos: 0.1 },
        { item: 'b', pos: 0.15 },
        { item: 'c', pos: 0.2 },
        { item: 'd', pos: 0.5 },
      ],
      0.2,
    )
    expect(placed.map((p) => p.lane)).toEqual([0, 1, 2, 0])
  })

  it('pulls chips near the end back so they stay on the strip', () => {
    const placed = placeInLanes(
      [
        { item: 'a', pos: 0.7 },
        { item: 'b', pos: 0.95 },
      ],
      0.2,
    )
    expect(placed.map((p) => p.lane)).toEqual([0, 1])
  })
})

describe('daysUntil', () => {
  it('counts local days', () => {
    expect(daysUntil(new Date(2026, 9, 14, 23, 59), new Date(2026, 9, 14, 0, 1))).toBe(0)
    expect(daysUntil(new Date(2026, 9, 16, 9), new Date(2026, 9, 14, 23))).toBe(2)
  })
})
