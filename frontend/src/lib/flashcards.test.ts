import { describe, expect, it } from 'vitest'

import type { Flashcard } from '@/lib/api'

import { cardMaturity, maturityCounts, nextReviewLabel } from './flashcards'

function card(over: Partial<Flashcard>): Flashcard {
  return {
    id: 1,
    module_id: 1,
    submodule_id: null,
    front: 'f',
    back: 'b',
    source: 'manual',
    ease_factor: 2.5,
    interval_days: 0,
    repetitions: 0,
    due_at: '2026-01-01T00:00:00',
    last_reviewed_at: null,
    ...over,
  }
}

describe('cardMaturity', () => {
  it('is new until the first review', () => {
    expect(cardMaturity(card({}))).toBe('new')
  })

  it('steps up at 7 and 21 days', () => {
    const reviewed = { last_reviewed_at: '2026-01-01T00:00:00' }
    expect(cardMaturity(card({ ...reviewed, interval_days: 1 }))).toBe('learning')
    expect(cardMaturity(card({ ...reviewed, interval_days: 6 }))).toBe('learning')
    expect(cardMaturity(card({ ...reviewed, interval_days: 7 }))).toBe('known')
    expect(cardMaturity(card({ ...reviewed, interval_days: 21 }))).toBe('mastered')
  })

  it('a forgotten card (interval reset) is learning again, not new', () => {
    expect(cardMaturity(card({ last_reviewed_at: '2026-01-01T00:00:00', interval_days: 1, repetitions: 0 }))).toBe('learning')
  })
})

it('counts cards per maturity', () => {
  const reviewed = { last_reviewed_at: '2026-01-01T00:00:00' }
  expect(maturityCounts([card({}), card({ ...reviewed, interval_days: 30 }), card({ ...reviewed, interval_days: 30 })])).toEqual({
    new: 1,
    learning: 0,
    known: 0,
    mastered: 2,
  })
})

describe('nextReviewLabel', () => {
  const now = new Date(2026, 0, 10, 12, 0)
  it.each([
    [new Date(2026, 0, 10, 11, 0), 'Due now'],
    [new Date(2026, 0, 10, 18, 0), 'Later today'],
    [new Date(2026, 0, 11, 9, 0), 'Tomorrow'],
    [new Date(2026, 0, 22, 9, 0), 'In 12 days'],
    [new Date(2026, 3, 10, 9, 0), 'In 3 months'],
  ])('%s → %s', (due, label) => {
    expect(nextReviewLabel(due.toISOString(), now)).toBe(label)
  })
})
