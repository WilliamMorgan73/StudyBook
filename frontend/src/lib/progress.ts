import type { RadialProgressSegment } from '@/components/RadialProgress'
import type { CompletionProgress } from '@/lib/api'

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
