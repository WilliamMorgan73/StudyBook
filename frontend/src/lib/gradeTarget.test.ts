import { describe, expect, it } from 'vitest'

import { classOf, DEFAULT_BOUNDARIES, GRADE_TARGET_CONFIG, targetLabel, targetPercent } from '@/lib/gradeTarget'

describe('GRADE_TARGET_CONFIG', () => {
  it('defaults to a 2:1 with UK boundaries', () => {
    const cfg = GRADE_TARGET_CONFIG.normalize(undefined)
    expect(cfg).toEqual({ target: 'upper', percent: 60, boundaries: DEFAULT_BOUNDARIES })
    expect(targetPercent(cfg)).toBe(60)
    expect(targetLabel(cfg)).toBe('a 2:1')
  })

  it('keeps a custom percentage and edited boundaries, clamped to 0–100', () => {
    const cfg = GRADE_TARGET_CONFIG.normalize({ target: 'custom', percent: 150, boundaries: { first: 68, upper: 'x' } })
    expect(cfg.percent).toBe(100)
    expect(cfg.boundaries).toEqual({ ...DEFAULT_BOUNDARIES, first: 68 })
    expect(targetLabel(cfg)).toBe('100%')
    expect(targetPercent(GRADE_TARGET_CONFIG.normalize({ target: 'first', boundaries: { first: 68 } }))).toBe(68)
  })
})

describe('classOf', () => {
  it('finds the class a mark falls in', () => {
    expect(classOf(71, DEFAULT_BOUNDARIES)).toBe('first')
    expect(classOf(60, DEFAULT_BOUNDARIES)).toBe('upper')
    expect(classOf(39.9, DEFAULT_BOUNDARIES)).toBeNull()
  })
})
