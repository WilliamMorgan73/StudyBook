import { describe, expect, it } from 'vitest'

import { overflowLabel } from '@/lib/calendarCells'

describe('overflowLabel', () => {
  it('counts the events when no titles fit', () => {
    expect(overflowLabel(4, 0)).toBe('4 events')
    expect(overflowLabel(1, 0)).toBe('1 event')
  })

  it('says how many more under the titles that fit', () => {
    expect(overflowLabel(5, 2)).toBe('+3 more')
  })

  it('says nothing when every title fits', () => {
    expect(overflowLabel(2, 2)).toBeNull()
    expect(overflowLabel(0, 0)).toBeNull()
  })
})
