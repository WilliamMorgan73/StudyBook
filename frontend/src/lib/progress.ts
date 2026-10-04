import type { RadialProgressSegment } from '@/components/RadialProgress'
import type { Assignment, CompletionProgress } from '@/lib/api'
import { assignmentScore } from '@/lib/grades'

/** Alpha suffix applied to a module's accent color for the "completed but short of full marks" arc. */
const SHORTFALL_ALPHA = '4d'

/**
 * Turns a module's weight-based completion progress into a two-arc ring: the full-color arc is
 * how much of the module's grade has actually been earned (achieved_fraction), the faded arc is
 * the rest of what's been submitted/graded but didn't score full marks (completed_fraction −
 * achieved_fraction). `scale` lets a caller fold in its own share of a larger aggregate ring
 * (e.g. a module's credit-weighted share of an overall progress ring).
 */
export function progressRingSegments(
  progress: CompletionProgress,
  color: string,
  scale = 1,
): RadialProgressSegment[] {
  const achieved = Math.max(0, Math.min(1, progress.achieved_fraction))
  const shortfall = Math.max(0, Math.min(1 - achieved, progress.completed_fraction - achieved))

  return [
    { fraction: scale * achieved, color },
    { fraction: scale * shortfall, color: `${color}${SHORTFALL_ALPHA}` },
  ]
}

/**
 * The module ring split by assignment, so each can be highlighted: per submitted/graded
 * assignment, an achieved arc (its weight × its score) and a faded arc for the rest of its weight.
 * Arcs carry the assignment's id and add up to the module's `completion_progress`, by the same rule
 * as the backend's `compute_completion_progress`.
 */
export function assignmentRingSegments(
  assignments: Pick<Assignment, 'id' | 'status' | 'weight_percent' | 'grade_earned' | 'grade_max'>[],
  color: string,
): RadialProgressSegment[] {
  return assignments
    .filter((a) => a.status === 'submitted' || a.status === 'graded')
    .flatMap((a) => {
      const share = a.weight_percent / 100
      const score = assignmentScore(a) ?? 0
      return [
        { id: a.id, fraction: share * score, color },
        { id: a.id, fraction: share * (1 - score), color: `${color}${SHORTFALL_ALPHA}` },
      ]
    })
}
