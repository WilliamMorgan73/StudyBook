import { describe, expect, it } from 'vitest'

import { formatBackupDate, summarizeCounts } from './backup'

describe('summarizeCounts', () => {
  it('lists the non-empty headline tables with plurals', () => {
    expect(
      summarizeCounts({ modules: 1, submodules: 12, assignments: 0, flashcards: 140, attachments: 2, quick_todos: 9 }),
    ).toBe('1 module, 12 topics, 140 flashcards, 2 files')
  })

  it('says so when there is nothing', () => {
    expect(summarizeCounts({ modules: 0 })).toBe('No data')
  })
})

describe('formatBackupDate', () => {
  it('falls back for an unreadable date', () => {
    expect(formatBackupDate('')).toBe('an unknown date')
    expect(formatBackupDate('2026-10-04T12:00:00+00:00')).toMatch(/2026/)
  })
})
