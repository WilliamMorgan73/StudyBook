import { describe, expect, it } from 'vitest'

import {
  defaultRevisionPlanForm,
  formatSessionLength,
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
