import { describe, expect, it } from 'vitest'

import {
  defaultRevisionPlanForm,
  formatSessionLength,
  replanForm,
  replanReasons,
  revisionPlanPayload,
  revisionSessionUrl,
  weaknessLabel,
} from './revision'

const EXAM_AT = '2026-06-15T09:00:00'

describe('revisionPlanPayload', () => {
  it('defaults to today, weekdays and hour-long sessions', () => {
    expect(revisionPlanPayload(defaultRevisionPlanForm('2026-06-01'), EXAM_AT)).toEqual({
      start_date: '2026-06-01',
      weekdays: [0, 1, 2, 3, 4],
      session_minutes: 60,
    })
  })

  it('dedupes and sorts weekdays', () => {
    const payload = revisionPlanPayload({ startDate: '2026-06-01', weekdays: [6, 2, 2], sessionMinutes: 45 }, EXAM_AT)
    expect(payload).toMatchObject({ weekdays: [2, 6], session_minutes: 45 })
  })

  it('requires a weekday and a start date', () => {
    expect(revisionPlanPayload({ startDate: '2026-06-01', weekdays: [], sessionMinutes: 60 }, EXAM_AT)).toHaveProperty(
      'error',
    )
    expect(revisionPlanPayload({ startDate: '', weekdays: [0], sessionMinutes: 60 }, EXAM_AT)).toHaveProperty('error')
  })

  it('allows the exam day itself but not after it', () => {
    expect(revisionPlanPayload({ startDate: '2026-06-15', weekdays: [0], sessionMinutes: 60 }, EXAM_AT)).not.toHaveProperty(
      'error',
    )
    expect(revisionPlanPayload({ startDate: '2026-06-16', weekdays: [0], sessionMinutes: 60 }, EXAM_AT)).toEqual({
      error: 'The start date must be on or before the exam.',
    })
  })
})

describe('formatSessionLength', () => {
  it('uses minutes under an hour and hours otherwise', () => {
    expect(formatSessionLength(45)).toBe('45 min')
    expect(formatSessionLength(60)).toBe('1 hour')
    expect(formatSessionLength(90)).toBe('1.5 hours')
    expect(formatSessionLength(120)).toBe('2 hours')
  })
})

describe('revisionSessionUrl', () => {
  it('points at the exam page with the session open', () => {
    expect(revisionSessionUrl({ id: 9, module_id: 2, assignment_id: 5 })).toBe('/modules/2/assignments/5?session=9')
  })
})

describe('weaknessLabel', () => {
  it('treats the neutral no-data score as fair', () => {
    expect(weaknessLabel(0.5)).toBe('Fair')
    expect(weaknessLabel(0.8)).toBe('Weak')
    expect(weaknessLabel(0.1)).toBe('Strong')
  })
})

describe('replanForm', () => {
  // 2026-06-01 is a Monday.
  const session = (starts_at: string, duration_minutes = 60) => ({ starts_at, duration_minutes })

  it("starts today with the plan's weekdays and latest session length", () => {
    const sessions = [session('2026-06-03T09:00:00', 45), session('2026-06-01T10:00:00', 45), session('2026-06-07T09:00:00', 90)]
    expect(replanForm(sessions, '2026-06-05')).toEqual({ startDate: '2026-06-05', weekdays: [0, 2, 6], sessionMinutes: 90 })
  })

  it('falls back to the defaults without sessions or with an unoffered length', () => {
    expect(replanForm([], '2026-06-05')).toEqual(defaultRevisionPlanForm('2026-06-05'))
    expect(replanForm([session('2026-06-02T09:00:00', 75)], '2026-06-05')).toMatchObject({ weekdays: [1], sessionMinutes: 60 })
  })
})

describe('replanReasons', () => {
  const topic = (title: string, planned_weakness: number, weakness: number) => ({ id: 1, title, planned_weakness, weakness })

  it('lists missed sessions, then weaker and stronger topics', () => {
    expect(
      replanReasons({
        missed_session_ids: [4, 5],
        shifted_topics: [topic('Graphs', 0.5, 0.8), topic('Sorting', 0.6, 0.3), topic('Trees', 0.2, 0.5)],
      }),
    ).toEqual(['2 sessions missed', 'Graphs, Trees got weaker', 'Sorting got stronger'])
  })

  it('says nothing when the plan is on track', () => {
    expect(replanReasons({ missed_session_ids: [], shifted_topics: [] })).toEqual([])
    expect(replanReasons({ missed_session_ids: [1], shifted_topics: [] })).toEqual(['1 session missed'])
  })
})
