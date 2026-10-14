import { describe, expect, it } from 'vitest'

import { completedLabel, filterModules, MODULES_WIDGET_CONFIG } from '@/lib/moduleCompletion'

describe('MODULES_WIDGET_CONFIG', () => {
  it('defaults to both, so existing layouts look the same', () => {
    expect(MODULES_WIDGET_CONFIG.normalize(undefined)).toEqual({ show: 'both' })
    expect(MODULES_WIDGET_CONFIG.normalize({})).toEqual({ show: 'both' })
  })

  it('keeps a valid choice and drops anything else', () => {
    expect(MODULES_WIDGET_CONFIG.normalize({ show: 'open' })).toEqual({ show: 'open' })
    expect(MODULES_WIDGET_CONFIG.normalize({ show: 'completed' })).toEqual({ show: 'completed' })
    expect(MODULES_WIDGET_CONFIG.normalize({ show: 'archived' })).toEqual({ show: 'both' })
    expect(MODULES_WIDGET_CONFIG.normalize('open')).toEqual({ show: 'both' })
  })
})

describe('filterModules', () => {
  const open = { id: 1, completed_at: null }
  const done = { id: 2, completed_at: '2026-06-20T14:30:00' }

  it('lists open, completed or both', () => {
    expect(filterModules([open, done], 'open')).toEqual([open])
    expect(filterModules([open, done], 'completed')).toEqual([done])
    expect(filterModules([open, done], 'both')).toEqual([open, done])
  })
})

describe('completedLabel', () => {
  it('shows the month and year', () => {
    expect(completedLabel('2026-06-20T14:30:00')).toBe(
      `Completed ${new Date(2026, 5, 20).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`,
    )
  })

  it('falls back to a plain label for a bad date', () => {
    expect(completedLabel('nope')).toBe('Completed')
  })
})
