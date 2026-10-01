import { describe, expect, it } from 'vitest'

import {
  clampCardCount,
  countByStatus,
  DEFAULT_CARD_COUNT,
  MAX_CARD_COUNT,
  pendingItems,
  reviewItems,
  updateItem,
  validateEdit,
} from './flashcardReview'

describe('review items', () => {
  const items = reviewItems([
    { front: 'Q1', back: 'A1' },
    { front: 'Q2', back: 'A2' },
    { front: 'Q3', back: 'A3' },
  ])

  it('start pending with stable keys', () => {
    expect(items.map((i) => [i.key, i.status])).toEqual([
      [0, 'pending'],
      [1, 'pending'],
      [2, 'pending'],
    ])
  })

  it('update one item without touching the others', () => {
    const next = updateItem(items, 1, { status: 'rejected', front: 'edited' })
    expect(next[1]).toEqual({ key: 1, front: 'edited', back: 'A2', status: 'rejected' })
    expect(next[0]).toBe(items[0])
    expect(items[1].status).toBe('pending')
  })

  it('count statuses and list what is left to review', () => {
    const next = updateItem(updateItem(items, 0, { status: 'accepted' }), 2, { status: 'saving' })
    expect(countByStatus(next)).toEqual({ pending: 1, saving: 1, accepted: 1, rejected: 0 })
    expect(pendingItems(next).map((i) => i.key)).toEqual([1])
  })
})

describe('clampCardCount', () => {
  it('keeps whole numbers within 1..MAX', () => {
    expect(clampCardCount('12')).toBe(12)
    expect(clampCardCount('0')).toBe(1)
    expect(clampCardCount('99')).toBe(MAX_CARD_COUNT)
    expect(clampCardCount('7.6')).toBe(8)
  })

  it('falls back to the default for blanks and junk', () => {
    expect(clampCardCount('')).toBe(DEFAULT_CARD_COUNT)
    expect(clampCardCount('abc')).toBe(DEFAULT_CARD_COUNT)
  })
})

describe('validateEdit', () => {
  it('trims both sides', () => {
    expect(validateEdit('  Q ', '\nA\n')).toEqual({ front: 'Q', back: 'A' })
  })

  it('rejects a blank side', () => {
    expect(validateEdit('Q', '   ')).toHaveProperty('error')
  })
})
