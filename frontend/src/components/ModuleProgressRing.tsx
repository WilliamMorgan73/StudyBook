import { RadialProgress } from '@/components/RadialProgress'
import type { AssignmentProgress } from '@/lib/api'

/** Three shades of the module's own accent color: graded (full), in-progress (medium), not started (faint). */
export function ModuleProgressRing({
  progress,
  color,
  size = 40,
  strokeWidth = 4,
}: {
  progress: AssignmentProgress
  color: string
  size?: number
  strokeWidth?: number
}) {
  const total = progress.total

  return (
    <RadialProgress
      size={size}
      strokeWidth={strokeWidth}
      segments={
        total === 0
          ? []
          : [
              { fraction: progress.graded / total, color },
              { fraction: progress.in_progress / total, color: `${color}b3` },
              { fraction: progress.not_started / total, color: `${color}4d` },
            ]
      }
    />
  )
}
