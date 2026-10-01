import { describe, expect, it } from 'vitest'

import type { CalendarEvent, PersonalEvent } from './api'
import {
  busyLast,
  calendarEventKey,
  formatWeekdays,
  personalEventFormState,
  personalEventPayload,
  toggleWeekday,
  visibleCalendarEvents,
  type PersonalEventFormState,
} from './busyTime'

const validForm: PersonalEventFormState = {
  title: '  Work shift ',
  weekdays: [4, 0, 2],
  startTime: '09:00',
  endTime: '17:00',
  validFrom: '2026-10-01',
  validUntil: '',
}

function event(kind: CalendarEvent['kind'], id: number, startsAt: string): CalendarEvent {
  return {
    kind,
    id,
    module_id: kind === 'busy' ? null : 1,
    title: `${kind} ${id}`,
    starts_at: startsAt,
    ends_at: null,
    location: null,
    url: kind === 'busy' ? null : '/modules/1',
  }
}

describe('formatWeekdays', () => {
  it('names common patterns', () => {
    expect(formatWeekdays([0, 1, 2, 3, 4])).toBe('Weekdays')
    expect(formatWeekdays([6, 5])).toBe('Weekends')
    expect(formatWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day')
  })

  it('lists other days in week order', () => {
    expect(formatWeekdays([4, 0, 2])).toBe('Mon, Wed, Fri')
  })
})

describe('personalEventPayload', () => {
  it('trims the title, sorts weekdays and treats a blank valid-until as open-ended', () => {
    expect(personalEventPayload(validForm)).toEqual({
      title: 'Work shift',
      weekdays: [0, 2, 4],
      start_time: '09:00',
      end_time: '17:00',
      valid_from: '2026-10-01',
      valid_until: null,
    })
  })

  it('allows an end time before the start time (overnight)', () => {
    expect(personalEventPayload({ ...validForm, startTime: '22:00', endTime: '06:00' })).toMatchObject({
      start_time: '22:00',
      end_time: '06:00',
    })
  })

  it('keeps an inclusive valid-until equal to valid-from', () => {
    expect(personalEventPayload({ ...validForm, validUntil: '2026-10-01' })).toMatchObject({
      valid_until: '2026-10-01',
    })
  })

  it.each([
    [{ title: ' ' }, 'Title is required.'],
    [{ weekdays: [] }, 'Pick at least one weekday.'],
    [{ endTime: '' }, 'Start and end times are required.'],
    [{ endTime: '09:00' }, 'End time must differ from start time.'],
    [{ validFrom: '' }, 'Valid-from date is required.'],
    [{ validUntil: '2026-09-30' }, "Valid-until can't be before valid-from."],
  ])('rejects %o', (override, error) => {
    expect(personalEventPayload({ ...validForm, ...override })).toEqual({ error })
  })
})

describe('personalEventFormState', () => {
  it('starts a new event today with no end date', () => {
    expect(personalEventFormState(undefined, '2026-10-01')).toEqual({
      title: '',
      weekdays: [],
      startTime: '',
      endTime: '',
      validFrom: '2026-10-01',
      validUntil: '',
    })
  })

  it('round-trips an existing event into input values', () => {
    const existing: PersonalEvent = {
      id: 1,
      title: 'Training',
      weekdays: [1, 3],
      start_time: '18:30:00',
      end_time: '20:00:00',
      valid_from: '2026-09-01',
      valid_until: null,
      created_at: '2026-09-01T00:00:00',
    }
    const form = personalEventFormState(existing, '2026-10-01')
    expect(form).toMatchObject({ startTime: '18:30', endTime: '20:00', validUntil: '' })
    expect(personalEventPayload(form)).toMatchObject({ weekdays: [1, 3], valid_from: '2026-09-01', valid_until: null })
  })
})

describe('toggleWeekday', () => {
  it('adds in week order and removes', () => {
    expect(toggleWeekday([4], 1)).toEqual([1, 4])
    expect(toggleWeekday([1, 4], 4)).toEqual([1])
  })
})

describe('calendar busy events', () => {
  const lecture = event('lecture', 1, '2026-10-05T09:00:00')
  const busyMon = event('busy', 7, '2026-10-05T08:00:00')
  const busyTue = event('busy', 7, '2026-10-06T08:00:00')
  const exam = event('exam', 2, '2026-10-05T14:00:00')
  const events = [busyMon, lecture, exam, busyTue]

  it('gives each occurrence of the same personal event its own key', () => {
    expect(calendarEventKey(busyMon)).not.toBe(calendarEventKey(busyTue))
  })

  it('drops busy events only when hidden, otherwise keeping order', () => {
    expect(visibleCalendarEvents(events, true)).toEqual(events)
    expect(visibleCalendarEvents(events, false)).toEqual([lecture, exam])
  })

  it('moves busy events after the rest for marker slots', () => {
    expect(busyLast(events)).toEqual([lecture, exam, busyMon, busyTue])
  })
})
