import { describe, expect, it } from 'vitest'

import { assignmentContribution, moduleStanding, overallOutlook, targetOutlook, type GradedFields } from '@/lib/grades'

const graded = (weight: number, earned: number, max = 100): GradedFields => ({
  status: 'graded',
  weight_percent: weight,
  grade_earned: earned,
  grade_max: max,
})
const pending = (weight: number): GradedFields => ({
  status: 'not_started',
  weight_percent: weight,
  grade_earned: null,
  grade_max: null,
})

describe('assignmentContribution', () => {
  it('is weight times score once graded', () => {
    expect(assignmentContribution(graded(40, 15, 20))).toBe(30)
  })

  it('is null until graded', () => {
    expect(assignmentContribution(pending(40))).toBeNull()
    expect(assignmentContribution({ ...graded(40, 15), status: 'submitted' })).toBeNull()
  })
})

describe('targetOutlook', () => {
  it('works out the average needed on the ungraded weight', () => {
    // 30 points from 40% graded; 40 more needed from the other 60%.
    expect(targetOutlook([graded(40, 75), pending(60)], 70)).toEqual({ kind: 'needs', needed: expect.closeTo(66.667, 2), remainingWeight: 60 })
  })

  it('counts weight with no assignment yet as still to play for', () => {
    expect(targetOutlook([graded(50, 80)], 70)).toEqual({ kind: 'needs', needed: 60, remainingWeight: 50 })
  })

  it('is secured once the graded points already reach the target', () => {
    expect(targetOutlook([graded(80, 100), pending(20)], 70)).toEqual({ kind: 'secured' })
  })

  it('is unreachable when it would take more than 100%', () => {
    expect(targetOutlook([graded(90, 50), pending(10)], 70)).toMatchObject({ kind: 'unreachable' })
  })

  it('is final when everything is graded', () => {
    expect(targetOutlook([graded(60, 50), graded(40, 100)], 70)).toEqual({ kind: 'final', achieved: 70 })
  })
})

describe('overallOutlook', () => {
  const graded = (weight: number, earned: number) => ({ status: 'graded' as const, weight_percent: weight, grade_earned: earned, grade_max: 100 })
  const open = (weight: number) => ({ status: 'not_started' as const, weight_percent: weight, grade_earned: null, grade_max: null })

  it('reads a module as points earned plus weight still to grade', () => {
    expect(moduleStanding([graded(40, 50), open(60)])).toEqual({ achieved: 20, remainingWeight: 60 })
    // Weight not created yet is still to play for.
    expect(moduleStanding([graded(20, 100)])).toEqual({ achieved: 20, remainingWeight: 80 })
  })

  it('weights modules by credits for the average needed on what is left', () => {
    // A (20 credits): 20 earned, 60 left. B (10 credits): 30 earned, 50 left.
    // Credit-weighted: earned (400 + 300) / 30 ≈ 23.3, left (1200 + 500) / 30 ≈ 56.7, so 60% needs ≈ 64.7%.
    const out = overallOutlook(
      [
        { credits: 20, achieved: 20, remainingWeight: 60 },
        { credits: 10, achieved: 30, remainingWeight: 50 },
      ],
      60,
    )
    expect(out.kind).toBe('needs')
    expect(out.kind === 'needs' && out.needed).toBeCloseTo(64.71, 1)
  })

  it('reports secured, unreachable and final', () => {
    expect(overallOutlook([{ credits: null, achieved: 75, remainingWeight: 25 }], 70)).toEqual({ kind: 'secured' })
    expect(overallOutlook([{ credits: null, achieved: 10, remainingWeight: 20 }], 70).kind).toBe('unreachable')
    expect(overallOutlook([{ credits: 10, achieved: 65, remainingWeight: 0 }], 70)).toEqual({ kind: 'final', achieved: 65 })
  })
})
