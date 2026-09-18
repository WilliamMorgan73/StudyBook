import { describe, expect, it } from 'vitest'

import { nextDateSeriesState, nextTimeRangeState } from '@/lib/lectureSchedule'

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
