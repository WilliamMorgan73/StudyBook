import { describe, expect, it } from 'vitest'

import { examEndsAt, examFieldsPayload } from './exam'

describe('examFieldsPayload', () => {
  it('clears exam-only fields for coursework even if inputs are filled', () => {
    expect(examFieldsPayload({ isExam: false, duration: '120', location: 'Hall A' })).toEqual({
      kind: 'coursework',
      duration_minutes: null,
      location: null,
    })
  })

  it('parses duration and trims location for exams', () => {
    expect(examFieldsPayload({ isExam: true, duration: ' 90 ', location: '  Sports Hall ' })).toEqual({
      kind: 'exam',
      duration_minutes: 90,
      location: 'Sports Hall',
    })
  })

  it('allows an exam with no duration or location yet', () => {
    expect(examFieldsPayload({ isExam: true, duration: '', location: '' })).toEqual({
      kind: 'exam',
      duration_minutes: null,
      location: null,
    })
  })

  it('rejects non-positive or fractional durations', () => {
    expect(examFieldsPayload({ isExam: true, duration: '0', location: '' })).toHaveProperty('error')
    expect(examFieldsPayload({ isExam: true, duration: '1.5', location: '' })).toHaveProperty('error')
    expect(examFieldsPayload({ isExam: true, duration: 'abc', location: '' })).toHaveProperty('error')
  })
})

describe('examEndsAt', () => {
  it('adds the duration to the start', () => {
    expect(examEndsAt('2026-06-01T09:00:00', 120)?.getTime()).toBe(new Date('2026-06-01T11:00:00').getTime())
  })

  it('is null without a duration', () => {
    expect(examEndsAt('2026-06-01T09:00:00', null)).toBeNull()
  })
})
