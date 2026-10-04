// Grade maths for the module page, on the same footing as the backend's `crud/grades.py`: weights
// are percentages of the module's full 100%, and weight with no graded assignment yet (including
// assignments not created yet) is still to play for.

import type { Assignment } from '@/lib/api'

export type GradedFields = Pick<Assignment, 'status' | 'weight_percent' | 'grade_earned' | 'grade_max'>

/** A graded assignment's score as a 0–1 fraction; null until it's graded. */
export function assignmentScore(a: GradedFields): number | null {
  if (a.status !== 'graded' || a.grade_earned === null || !a.grade_max) return null
  return Math.max(0, Math.min(1, a.grade_earned / a.grade_max))
}

/** Points of the module's 100 this assignment has earned; null until it's graded. */
export function assignmentContribution(a: GradedFields): number | null {
  const score = assignmentScore(a)
  return score === null ? null : score * a.weight_percent
}

export type TargetOutlook =
  /** Nothing left to grade: the final mark is `achieved`. */
  | { kind: 'final'; achieved: number }
  /** Reached even with zero on everything left. */
  | { kind: 'secured' }
  /** Needs an average of `needed`% on the remaining weight. */
  | { kind: 'needs'; needed: number; remainingWeight: number }
  /** Would need more than 100% on the remaining weight. */
  | { kind: 'unreachable'; needed: number; remainingWeight: number }

/** What average the ungraded weight needs for the module to finish on `target`%. */
export function targetOutlook(assignments: GradedFields[], target: number): TargetOutlook {
  let gradedWeight = 0
  let achieved = 0
  for (const a of assignments) {
    const points = assignmentContribution(a)
    if (points === null) continue
    gradedWeight += a.weight_percent
    achieved += points
  }
  const remainingWeight = Math.max(0, 100 - gradedWeight)
  if (remainingWeight === 0) return { kind: 'final', achieved }
  if (achieved >= target) return { kind: 'secured' }
  const needed = ((target - achieved) / remainingWeight) * 100
  return needed > 100 ? { kind: 'unreachable', needed, remainingWeight } : { kind: 'needs', needed, remainingWeight }
}
