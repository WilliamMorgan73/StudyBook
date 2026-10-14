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

/** Where a module stands: points of its 100 earned so far, and the weight still to be graded. */
export interface ModuleStanding {
  achieved: number
  remainingWeight: number
}

export function moduleStanding(assignments: GradedFields[]): ModuleStanding {
  let gradedWeight = 0
  let achieved = 0
  for (const a of assignments) {
    const points = assignmentContribution(a)
    if (points === null) continue
    gradedWeight += a.weight_percent
    achieved += points
  }
  return { achieved, remainingWeight: Math.max(0, 100 - gradedWeight) }
}

/**
 * The same question across modules, weighted by credits (as the Progress ring is: a module with
 * no credits set counts as 1): what average on everything still to be graded, in every module,
 * puts the overall mark on `target`%.
 */
export function overallOutlook(modules: (ModuleStanding & { credits: number | null })[], target: number): TargetOutlook {
  let weight = 0
  let achieved = 0
  let remaining = 0
  for (const m of modules) {
    const w = m.credits ?? 1
    weight += w
    achieved += w * m.achieved
    remaining += w * m.remainingWeight
  }
  if (weight === 0) return { kind: 'needs', needed: target, remainingWeight: 100 }
  const [achievedAvg, remainingAvg] = [achieved / weight, remaining / weight]
  if (remainingAvg === 0) return { kind: 'final', achieved: achievedAvg }
  if (achievedAvg >= target) return { kind: 'secured' }
  const needed = ((target - achievedAvg) / remainingAvg) * 100
  return needed > 100
    ? { kind: 'unreachable', needed, remainingWeight: remainingAvg }
    : { kind: 'needs', needed, remainingWeight: remainingAvg }
}
