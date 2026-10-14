import { describe, expect, it } from 'vitest'

import { activityLevel, activityWeeks, dayKey, streaks } from '@/lib/activity'

// Wed 14 Oct 2026.
const TODAY = new Date(2026, 9, 14, 15, 0)

describe('activityWeeks', () => {
  it('ends with this week, Monday first, with future days empty', () => {
    const weeks = activityWeeks(TODAY, 3)
    expect(weeks).toHaveLength(3)
    expect(dayKey(weeks[0][0]!)).toBe('2026-09-28')
    expect(dayKey(weeks[2][0]!)).toBe('2026-10-12')
    expect(dayKey(weeks[2][2]!)).toBe('2026-10-14')
    expect(weeks[2].slice(3)).toEqual([null, null, null, null])
  })
})

describe('streaks', () => {
  const counts = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, 3]))

  it('counts back from today', () => {
    expect(streaks(counts('2026-10-12', '2026-10-13', '2026-10-14'), TODAY)).toEqual({ current: 3, longest: 3 })
  })

  it('keeps yesterday’s streak alive while today has none yet', () => {
    expect(streaks(counts('2026-10-12', '2026-10-13'), TODAY).current).toBe(2)
    expect(streaks(counts('2026-10-11', '2026-10-12'), TODAY).current).toBe(0)
  })

  it('finds the longest run, across month ends', () => {
    const data = counts('2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-10', '2026-10-14')
    expect(streaks({ ...data, '2026-10-05': 0 }, TODAY)).toEqual({ current: 1, longest: 4 })
  })
})

describe('activityLevel', () => {
  it('ramps relative to the busiest day', () => {
    expect([0, 1, 5, 10, 20].map((c) => activityLevel(c, 20))).toEqual([0, 1, 1, 2, 4])
    expect(activityLevel(3, 0)).toBe(0)
  })
})
