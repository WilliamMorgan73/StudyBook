import { describe, expect, it } from 'vitest'

import type { CalendarEvent } from './api'
import { calendarEventColor, formatSyncedAgo } from './calendarFeeds'

describe('formatSyncedAgo', () => {
  const now = new Date('2026-10-04T12:00:00Z')

  it('reads the naive timestamp as UTC', () => {
    expect(formatSyncedAgo('2026-10-04T11:48:00', now)).toBe('12 min ago')
  })

  it('rounds down through minutes, hours and days', () => {
    expect(formatSyncedAgo('2026-10-04T11:59:30', now)).toBe('just now')
    expect(formatSyncedAgo('2026-10-04T09:00:00', now)).toBe('3 h ago')
    expect(formatSyncedAgo('2026-10-03T11:00:00', now)).toBe('1 day ago')
    expect(formatSyncedAgo('2026-10-01T12:00:00', now)).toBe('3 days ago')
  })

  it('says never before the first sync', () => {
    expect(formatSyncedAgo(null, now)).toBe('never')
  })
})

describe('calendarEventColor', () => {
  const base: CalendarEvent = {
    kind: 'busy',
    id: 1,
    module_id: null,
    title: 'Shift',
    starts_at: '2026-10-05T09:00:00',
    ends_at: '2026-10-05T13:00:00',
    location: null,
    url: null,
    done: null,
    feed_id: null,
    color: null,
    all_day: false,
  }
  const moduleColor = (id: number | null) => (id === 2 ? '#6366f1' : 'grey')

  it("prefers a feed event's own colour, else the module's", () => {
    expect(calendarEventColor({ ...base, feed_id: 4, color: '#f43f5e' }, moduleColor)).toBe('#f43f5e')
    expect(calendarEventColor({ ...base, kind: 'lecture', module_id: 2 }, moduleColor)).toBe('#6366f1')
  })
})
