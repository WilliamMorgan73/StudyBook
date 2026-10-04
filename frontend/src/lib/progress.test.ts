import { describe, expect, it } from 'vitest'

import { assignmentRingSegments, progressRingSegments } from '@/lib/progress'

describe('progressRingSegments', () => {
  it('splits achieved and shortfall into full-color and faded arcs', () => {
    const segments = progressRingSegments({ completed_fraction: 0.6, achieved_fraction: 0.48 }, '#6366f1')

    expect(segments).toEqual([
      { fraction: 0.48, color: '#6366f1' },
      { fraction: 0.12, color: '#6366f14d' },
    ])
  })

  it('has no shortfall arc when everything completed was fully achieved', () => {
    const segments = progressRingSegments({ completed_fraction: 0.5, achieved_fraction: 0.5 }, '#6366f1')

    expect(segments[1].fraction).toBe(0)
  })

  it('clamps achieved to 1 even if achieved_fraction somehow exceeds it', () => {
    const segments = progressRingSegments({ completed_fraction: 1, achieved_fraction: 1.2 }, '#6366f1')

    expect(segments[0].fraction).toBe(1)
    expect(segments[1].fraction).toBe(0)
  })

  it('never lets shortfall push the total past 1', () => {
    const segments = progressRingSegments({ completed_fraction: 1.5, achieved_fraction: 0.9 }, '#6366f1')

    expect(segments[0].fraction + segments[1].fraction).toBeLessThanOrEqual(1)
  })

  it('applies scale to both arcs for a credit-weighted share of an aggregate ring', () => {
    const segments = progressRingSegments({ completed_fraction: 0.6, achieved_fraction: 0.48 }, '#6366f1', 0.25)

    expect(segments).toEqual([
      { fraction: 0.12, color: '#6366f1' },
      { fraction: 0.03, color: '#6366f14d' },
    ])
  })
})

describe('assignmentRingSegments', () => {
  const base = { grade_earned: null, grade_max: null }

  it('gives each submitted or graded assignment an achieved and a faded arc, adding up to its weight', () => {
    const segments = assignmentRingSegments(
      [
        { ...base, id: 1, status: 'graded', weight_percent: 40, grade_earned: 15, grade_max: 20 },
        { ...base, id: 2, status: 'submitted', weight_percent: 20 },
        { ...base, id: 3, status: 'in_progress', weight_percent: 40 },
      ],
      '#6366f1',
    )

    expect(segments).toEqual([
      { id: 1, fraction: expect.closeTo(0.3), color: '#6366f1' },
      { id: 1, fraction: expect.closeTo(0.1), color: '#6366f14d' },
      { id: 2, fraction: 0, color: '#6366f1' },
      { id: 2, fraction: 0.2, color: '#6366f14d' },
    ])
  })
})
