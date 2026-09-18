import { RadialProgress } from '@/components/RadialProgress'
import type { CompletionProgress } from '@/lib/api'
import { progressRingSegments } from '@/lib/progress'

/**
 * Two shades of the module's own accent color, weighted by each assignment's weight_percent
 * (not just counted): the full-color arc is how much of the module's grade has actually been
 * earned so far (achieved_fraction), the faded arc is the rest of what's been submitted/graded
 * but didn't score full marks (completed_fraction - achieved_fraction). Whatever hasn't been
 * submitted/graded yet is left as the ring's plain unfilled remainder.
 */
export function ModuleProgressRing({
  progress,
  color,
  size = 40,
  strokeWidth = 4,
}: {
  progress: CompletionProgress
  color: string
  size?: number
  strokeWidth?: number
}) {
  return <RadialProgress size={size} strokeWidth={strokeWidth} segments={progressRingSegments(progress, color)} />
}
