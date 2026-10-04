import { describe, expect, it } from 'vitest'

import { assignmentContribution, targetOutlook, type GradedFields } from '@/lib/grades'

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
