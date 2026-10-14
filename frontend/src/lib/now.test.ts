import { describe, expect, it } from 'vitest'

import type { CalendarEvent } from '@/lib/api'
import { formatSpan, pickNow } from '@/lib/now'

// Wed 14 Oct 2026, 10:00 local.
const NOW = new Date(2026, 9, 14, 10, 0)
const at = (day: number, h: number, m = 0) => {
  const d = new Date(2026, 9, day, h, m)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `2026-10-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}
let nextId = 1
const event = (kind: CalendarEvent['kind'], starts_at: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  kind,
  id: nextId++,
  module_id: 1,
  title: kind,
  starts_at,
  ends_at: null,
  location: null,
  url: '/modules/1',
  done: kind === 'revision' ? false : null,
  feed_id: null,
  color: null,
  all_day: false,
  submodules: [],
  ...extra,
})

describe('pickNow', () => {
  it('puts a lecture that is on now first, with the time left', () => {
    const lecture = event('lecture', at(14, 9, 30), { ends_at: at(14, 10, 30) })
    const { main } = pickNow(NOW, [event('assignment_due', at(15, 12)), lecture], 3)
    expect(main).toMatchObject({ kind: 'lecture', phase: 'now', minutes: 30 })
  })

  it('counts a lecture from 15 minutes before it starts', () => {
    const soon = event('lecture', at(14, 10, 10))
    expect(pickNow(NOW, [soon], 0).main).toMatchObject({ kind: 'lecture', phase: 'soon', minutes: 10 })
    const later = event('lecture', at(14, 10, 20))
    expect(pickNow(NOW, [later], 0).main).toMatchObject({ kind: 'later', minutes: 20 })
  })

  it('then today’s revision, then deadlines within 48 hours, then cards', () => {
    const revision = event('revision', at(14, 14), { ends_at: at(14, 15) })
    const due = event('assignment_due', at(15, 12))
    const tooFar = event('exam', at(17, 9))
    const { main, next } = pickNow(NOW, [tooFar, due, revision], 5)
    expect(main).toMatchObject({ kind: 'revision' })
    expect(next).toEqual([{ kind: 'due', event: due, minutes: 26 * 60 }, { kind: 'cards', count: 5 }])
  })

  it('ignores busy time, done revision and past deadlines', () => {
    const items = [
      event('busy', at(14, 9), { ends_at: at(14, 11), module_id: null }),
      event('revision', at(14, 14), { done: true }),
      event('assignment_due', at(14, 9)),
    ]
    expect(pickNow(NOW, items, 0)).toEqual({ main: null, next: [] })
    expect(pickNow(NOW, items, 2).main).toEqual({ kind: 'cards', count: 2 })
  })
})

describe('formatSpan', () => {
  it('reads naturally', () => {
    expect(formatSpan(5)).toBe('5 min')
    expect(formatSpan(80)).toBe('1 h 20 min')
    expect(formatSpan(26 * 60)).toBe('26 h')
    expect(formatSpan(72 * 60)).toBe('3 days')
  })
})
