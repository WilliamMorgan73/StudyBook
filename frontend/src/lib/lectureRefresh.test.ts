import { describe, expect, it } from 'vitest'

import { refreshSummary } from '@/lib/lectureRefresh'

describe('refreshSummary', () => {
  it('says what changed', () => {
    expect(refreshSummary({ added: 0, linked: [], failed: [] })).toBe('Lectures are up to date')
    expect(refreshSummary({ added: 1, linked: [], failed: [] })).toBe('1 new lecture')
    expect(refreshSummary({ added: 3, linked: ['COMP4177 Lab'], failed: ['Uni'] })).toBe(
      '3 new lectures · linked “COMP4177 Lab” · couldn’t reach Uni',
    )
    expect(refreshSummary({ added: 0, linked: [], failed: ['Uni'] })).toBe('Couldn’t reach Uni')
  })
})
