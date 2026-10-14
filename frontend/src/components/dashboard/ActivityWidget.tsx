import { useMemo, useState } from 'react'

import { Flame } from 'lucide-react'

import { useModuleData } from '@/components/dashboard/moduleContext'
import { LoadSwap } from '@/components/LoadSwap'
import { Skeleton } from '@/components/ui/skeleton'
import { WidgetError } from '@/components/WidgetError'
import { getActivity } from '@/lib/api'
import { activityLevel, activityWeeks, dayKey, streaks } from '@/lib/activity'
import { useSampleData } from '@/lib/sampleData'
import { useAsync } from '@/lib/useAsync'
import { useElementSize } from '@/lib/useElementSize'

/** A year of history, enough for the widest heatmap and the longest streak in it. */
const HISTORY_WEEKS = 53
const CELL = 11
const GAP = 3
const MIN_WEEKS = 4

/** Share of the colour at each level; level 0 is the muted background. */
const LEVEL_MIX = [0, 30, 50, 75, 100]

/** Sample activity for previews: most days in the last few months, with gaps, deterministic. */
function sampleActivity(today: Date): Record<string, number> {
  const out: Record<string, number> = {}
  for (let i = 0; i < 120; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const n = (i * 7 + 3) % 11
    if (n > 2 && i % 9 !== 4) out[dayKey(d)] = n * 3
  }
  return out
}

/**
 * A GitHub-style heatmap of flashcard reviews per day, as many weeks as fit the widget's width,
 * with the current and longest streak (#95). `color` tints the ramp (a module's colour on its page).
 */
function Activity({ moduleId, color }: { moduleId?: number; color: string }) {
  const sample = useSampleData()
  const [today] = useState(() => new Date())
  const [sizeRef, size] = useElementSize<HTMLDivElement>()
  const history = useMemo(() => activityWeeks(today, HISTORY_WEEKS), [today])
  const activity = useAsync(() => {
    if (sample) return Promise.resolve(sampleActivity(today))
    return getActivity({ start: dayKey(history[0][0]!), end: dayKey(today), moduleId })
  }, [moduleId])

  const fit = Math.max(MIN_WEEKS, Math.min(HISTORY_WEEKS, Math.floor((size.width + GAP) / (CELL + GAP))))
  const shown = history.slice(-fit)
  const counts = activity.data ?? {}
  const max = Math.max(0, ...shown.flat().map((d) => (d ? (counts[dayKey(d)] ?? 0) : 0)))
  const { current, longest } = streaks(counts, today)
  const total = shown.flat().reduce((sum, d) => sum + (d ? (counts[dayKey(d)] ?? 0) : 0), 0)

  return (
    <div ref={sizeRef} className="flex min-h-full flex-col gap-2">
      {activity.error && <WidgetError message="Couldn't load activity." onRetry={activity.refetch} />}
      <LoadSwap loading={activity.loading} skeleton={<Skeleton className="h-28 w-full" />}>
        {activity.data && (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-1 font-medium">
                <Flame className={`size-4 ${current > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} aria-hidden />
                {current} day{current === 1 ? '' : 's'} streak
              </span>
              <span className="text-muted-foreground">Longest {longest}</span>
              <span className="text-muted-foreground">
                {total} review{total === 1 ? '' : 's'} in {shown.length} weeks
              </span>
            </div>
            <div className="flex gap-[3px]" role="img" aria-label={`Flashcard reviews per day for the last ${shown.length} weeks`}>
              {shown.map((week) => (
                <div key={dayKey(week[0]!)} className="flex flex-col gap-[3px]">
                  {week.map((date, i) => {
                    if (!date) return <span key={i} style={{ width: CELL, height: CELL }} />
                    const count = counts[dayKey(date)] ?? 0
                    const level = activityLevel(count, max)
                    const label = `${count === 0 ? 'No reviews' : `${count} review${count === 1 ? '' : 's'}`} · ${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`
                    // A native title rather than a Radix tooltip: a year is ~370 cells.
                    return (
                      <span
                        key={i}
                        title={label}
                        className={`rounded-[3px] ${level === 0 ? 'bg-muted' : ''}`}
                        style={{
                          width: CELL,
                          height: CELL,
                          backgroundColor: level > 0 ? `color-mix(in oklab, ${color} ${LEVEL_MIX[level]}%, transparent)` : undefined,
                        }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </LoadSwap>
    </div>
  )
}

export function ActivityWidget() {
  return <Activity color="var(--primary)" />
}

export function ModuleActivityWidget() {
  const { module } = useModuleData()
  return <Activity moduleId={module.id} color={module.color} />
}
