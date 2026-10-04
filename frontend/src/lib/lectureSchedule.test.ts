import { describe, expect, it } from 'vitest'

import type { Lecture } from '@/lib/api'
import {
  lecturesCovering,
  nextDateSeriesState,
  nextTimeRangeState,
  submoduleIdsByOccurrence,
  topicScopes,
} from '@/lib/lectureSchedule'

describe('nextDateSeriesState', () => {
  const base = { startDate: '2026-01-05', endDate: '2026-01-05', occurrences: '1' }

  it('recomputes end date from occurrences when start date changes', () => {
    const next = nextDateSeriesState({ ...base, occurrences: '4' }, 'startDate', '2026-02-02', 7)
    expect(next).toEqual({ startDate: '2026-02-02', endDate: '2026-02-23', occurrences: '4' })
  })

  it('recomputes occurrences from the date span when end date changes', () => {
    const next = nextDateSeriesState(base, 'endDate', '2026-01-26', 7)
    expect(next).toEqual({ startDate: '2026-01-05', endDate: '2026-01-26', occurrences: '4' })
  })

  it('recomputes end date from occurrences when occurrences changes', () => {
    const next = nextDateSeriesState(base, 'occurrences', '4', 7)
    expect(next).toEqual({ startDate: '2026-01-05', endDate: '2026-01-26', occurrences: '4' })
  })

  it('does nothing to the other fields when the series does not repeat (intervalDays 0)', () => {
    const next = nextDateSeriesState(base, 'occurrences', '9', 0)
    expect(next).toEqual({ ...base, occurrences: '9' })
  })

  it('picks up a new interval when repeat mode changes, holding occurrences constant', () => {
    // handleRepeatChange reuses the 'occurrences' branch with the new interval and the
    // current occurrences value, which is exactly how switching weekly -> fortnightly re-derives endDate.
    const weekly = nextDateSeriesState(base, 'occurrences', '4', 7)
    const fortnightly = nextDateSeriesState(weekly, 'occurrences', weekly.occurrences, 14)
    expect(fortnightly).toEqual({ startDate: '2026-01-05', endDate: '2026-02-16', occurrences: '4' })
  })

  it('clamps occurrences below 1 to a single occurrence', () => {
    const next = nextDateSeriesState(base, 'occurrences', '0', 7)
    expect(next.endDate).toBe('2026-01-05')
  })
})

describe('nextTimeRangeState', () => {
  const base = { startTime: '09:00', endTime: '', duration: '' }

  it('recomputes end time from duration when start time changes', () => {
    const next = nextTimeRangeState({ ...base, duration: '50' }, 'startTime', '10:00')
    expect(next).toEqual({ startTime: '10:00', endTime: '10:50', duration: '50' })
  })

  it('recomputes duration from the time span when end time changes', () => {
    const next = nextTimeRangeState(base, 'endTime', '09:50')
    expect(next).toEqual({ startTime: '09:00', endTime: '09:50', duration: '50' })
  })

  it('recomputes end time from start time when duration changes', () => {
    const next = nextTimeRangeState(base, 'duration', '50')
    expect(next).toEqual({ startTime: '09:00', endTime: '09:50', duration: '50' })
  })

  it('leaves duration unchanged when end time is before start time', () => {
    const next = nextTimeRangeState(base, 'endTime', '08:00')
    expect(next).toEqual({ startTime: '09:00', endTime: '08:00', duration: '' })
  })

  it('only sets its own field when start time is not set yet', () => {
    const next = nextTimeRangeState({ startTime: '', endTime: '', duration: '' }, 'duration', '50')
    expect(next).toEqual({ startTime: '', endTime: '', duration: '50' })
  })
})

function lecture(id: number, scheduledAt: string, submoduleIds: number[]): Lecture {
  return {
    id,
    module_id: 1,
    title: 'Lecture',
    scheduled_at: scheduledAt,
    duration_minutes: 60,
    location: null,
    week_number: null,
    feed_id: null,
    submodules: submoduleIds.map((sid) => ({ id: sid, title: `Topic ${sid}` })),
  }
}

describe('submoduleIdsByOccurrence', () => {
  it('lists the submodule ids of each occurrence in date order', () => {
    const lectures = [
      lecture(2, '2026-01-12T10:00:00', [3]),
      lecture(1, '2026-01-05T10:00:00', [1, 2]),
      lecture(3, '2026-01-19T10:00:00', []),
    ]
    expect(submoduleIdsByOccurrence(lectures)).toEqual([[1, 2], [3], []])
  })
})

describe('lecturesCovering', () => {
  it('splits the covering lectures at now: past latest first, upcoming soonest first', () => {
    const lectures = [
      lecture(1, '2026-01-05T10:00:00', [7]),
      lecture(2, '2026-01-12T10:00:00', [7, 8]),
      lecture(3, '2026-01-19T10:00:00', [8]),
      lecture(4, '2026-01-26T10:00:00', [7]),
      lecture(5, '2026-02-02T10:00:00', [7]),
    ]
    const { past, upcoming } = lecturesCovering(lectures, 7, new Date('2026-01-20T00:00:00'))
    expect(past.map((l) => l.id)).toEqual([2, 1])
    expect(upcoming.map((l) => l.id)).toEqual([4, 5])
  })
})

describe('topicScopes', () => {
  // Weeks of Monday 12:00 and Wednesday 15:00 lectures sharing one title, as a timetable lists them.
  const week = (n: number, day: 'mon' | 'wed') => {
    const date = new Date(2026, 9, 5 + (n - 1) * 7 + (day === 'wed' ? 2 : 0), day === 'wed' ? 15 : 12)
    const id = n * 10 + (day === 'wed' ? 2 : 1)
    return { ...lecture(id, toLocal(date), []), title: 'COMP4177 Lecture', feed_id: 4 }
  }
  const toLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00:00`
  const lectures = [1, 2, 3, 4].flatMap((n) => [week(n, 'mon'), week(n, 'wed')])
  const ids = (scopes: ReturnType<typeof topicScopes>) => Object.fromEntries(scopes.map((s) => [s.id, s.lectureIds]))

  it('offers the same weekday and time apart from the rest of the series', () => {
    const scopes = topicScopes(week(2, 'wed'), lectures)
    expect(ids(scopes)).toEqual({
      this: [22],
      'slot-following': [22, 32, 42],
      'slot-all': [12, 22, 32, 42],
      'series-following': [22, 31, 32, 41, 42],
      'series-all': [11, 12, 21, 22, 31, 32, 41, 42],
    })
    expect(scopes[2].label).toMatch(/^All Wednesdays at .* \(4 lectures\)$/)
  })

  it('leaves out options that change the same lectures as an earlier one', () => {
    // From the first Monday, "following" is everything, so only the "all" options would repeat it.
    expect(topicScopes(week(1, 'mon'), lectures).map((s) => s.id)).toEqual(['this', 'slot-following', 'series-following'])
    // The last Wednesday is the only one left in its slot.
    expect(topicScopes(week(4, 'wed'), lectures).map((s) => s.id)).toEqual(['this', 'slot-all', 'series-all'])
  })

  it('keeps other titles and other sources out of the series', () => {
    const others = [
      { ...week(3, 'mon'), id: 900, title: 'COMP4177 Lab' },
      { ...week(3, 'mon'), id: 901, feed_id: null },
    ]
    expect(ids(topicScopes(week(1, 'mon'), [...lectures, ...others]))['series-following']).not.toContain(900)
    expect(ids(topicScopes(week(1, 'mon'), [...lectures, ...others]))['series-following']).not.toContain(901)
  })

  it('gives a lone lecture only itself', () => {
    const lone = lecture(5, '2026-10-07T12:00:00', [])
    expect(topicScopes(lone, [lone])).toEqual([{ id: 'this', label: 'Only this lecture', lectureIds: [5] }])
  })
})
