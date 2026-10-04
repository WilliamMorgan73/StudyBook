import { describe, expect, it } from 'vitest'

import { DEFAULT_BANNER, MAX_BANNER_STATS, normalizeBanner, sameBanner } from '@/lib/moduleBanner'

describe('normalizeBanner', () => {
  it('falls back to the default for null and non-objects', () => {
    expect(normalizeBanner(null)).toBe(DEFAULT_BANNER)
    expect(normalizeBanner('grade')).toBe(DEFAULT_BANNER)
  })

  it('keeps a valid config as it is', () => {
    const config = { stats: ['nextExam', 'grade'], ring: false, tint: 'strong', size: 'compact' }
    expect(normalizeBanner(config)).toEqual(config)
  })

  it('drops unknown and duplicate stats, keeping their order, and caps the rest', () => {
    const banner = normalizeBanner({
      stats: ['weather', 'credits', 'credits', 'grade', 'nextExam', 'cardsDue', 'nextLecture'],
      ring: true,
      tint: 'soft',
      size: 'comfortable',
    })
    expect(banner.stats).toEqual(['credits', 'grade', 'nextExam', 'cardsDue'])
    expect(banner.stats).toHaveLength(MAX_BANNER_STATS)
  })

  it('defaults each malformed field on its own', () => {
    expect(normalizeBanner({ stats: 'grade', ring: 'yes', tint: 'neon', size: 'compact' })).toEqual({
      ...DEFAULT_BANNER,
      size: 'compact',
    })
  })

  it('allows no stats at all', () => {
    expect(normalizeBanner({ ...DEFAULT_BANNER, stats: [] }).stats).toEqual([])
  })
})

describe('sameBanner', () => {
  it('cares about stat order', () => {
    expect(sameBanner(DEFAULT_BANNER, { ...DEFAULT_BANNER })).toBe(true)
    expect(sameBanner(DEFAULT_BANNER, { ...DEFAULT_BANNER, stats: ['nextLecture', 'grade'] })).toBe(false)
  })
})
