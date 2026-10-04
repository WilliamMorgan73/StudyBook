import { useMemo, useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'

import { useOverview } from '@/components/dashboard/overviewContext'
import { LoadSwap } from '@/components/LoadSwap'
import { AnimatedNumber, RadialProgress } from '@/components/RadialProgress'
import { Skeleton } from '@/components/ui/skeleton'
import { progressRingSegments } from '@/lib/progress'
import { useElementSize } from '@/lib/useElementSize'

/** The ring grows with the widget up to RING_MAX (px). Below RING_FULL there's no room for its
 * caption, and it never gets smaller than RING_FLOOR. */
const RING_FLOOR = 40
const RING_FULL = 136
const RING_MAX = 320

export function ProgressWidget() {
  const { modules } = useOverview()
  // The module highlighted on the ring, from hovering its arc or its legend row.
  const [activeModuleId, setActiveModuleId] = useState<number | null>(null)
  const [sizeRef, size] = useElementSize<HTMLDivElement>()

  // Credit-weighted (falling back to equal weight when credits aren't set) so the aggregate ring
  // matches each module's own ring: achieved% of grade in the module's own color, the rest of
  // what's been submitted/graded but fell short of full marks in a faded shade of it.
  const totalWeight = (modules.data ?? []).reduce((sum, m) => sum + (m.credits ?? 1), 0)

  const progressSegments = useMemo(() => {
    if (totalWeight === 0) return []
    return (modules.data ?? []).flatMap((m) => {
      const share = (m.credits ?? 1) / totalWeight
      return progressRingSegments(m.completion_progress, m.color, share).map((s) => ({ ...s, id: m.id }))
    })
  }, [modules.data, totalWeight])

  const overallCompletion = useMemo(() => {
    if (totalWeight === 0) return { achieved: 0, completed: 0 }
    const totals = (modules.data ?? []).reduce(
      (acc, m) => {
        const weight = m.credits ?? 1
        return {
          achieved: acc.achieved + weight * m.completion_progress.achieved_fraction,
          completed: acc.completed + weight * m.completion_progress.completed_fraction,
        }
      },
      { achieved: 0, completed: 0 },
    )
    return { achieved: totals.achieved / totalWeight, completed: totals.completed / totalWeight }
  }, [modules.data, totalWeight])

  const legendModules = (modules.data ?? []).filter((m) => m.assignment_progress.total > 0)
  const activeModule = legendModules.find((m) => m.id === activeModuleId) ?? null

  // Room under the ring for the legend: a line per few modules, more when it wraps less. When even
  // a full-size ring wouldn't leave that room, the legend goes and the ring takes the whole widget,
  // so the widget never needs to scroll.
  const legendRoom = 24 + Math.ceil(Math.max(1, legendModules.length) / 2) * 22
  const showLegend = Math.min(size.width, size.height - legendRoom) >= RING_FULL
  const room = Math.min(size.width, showLegend ? size.height - legendRoom : size.height)
  const ringSize = Math.round(Math.min(RING_MAX, Math.max(RING_FLOOR, room)))
  const showCaption = ringSize >= RING_FULL
  const scale = ringSize / RING_FULL

  return (
    <div ref={sizeRef} className="flex min-h-0 flex-1 items-center justify-center">
      <LoadSwap loading={modules.loading} skeleton={<Skeleton className="size-32 rounded-full" />}>
        {modules.data && (
          <div className="flex flex-col items-center gap-3">
            <div className="relative flex items-center justify-center">
              <RadialProgress
                segments={progressSegments}
                size={ringSize}
                strokeWidth={Math.round(13 * Math.sqrt(scale))}
                activeId={activeModuleId}
                onActiveChange={(id) => setActiveModuleId(id as number | null)}
              />

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <p className="font-semibold tabular-nums" style={{ fontSize: `${1.875 * Math.sqrt(scale)}rem` }}>
                  {totalWeight === 0 ? (
                    '—'
                  ) : (
                    <>
                      <AnimatedNumber
                        value={Math.round(
                          (activeModule?.completion_progress.achieved_fraction ?? overallCompletion.achieved) * 100,
                        )}
                      />
                      %
                    </>
                  )}
                </p>
                {showCaption && (
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={activeModule?.id ?? 'overall'}
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.12 }}
                      className="w-full text-xs"
                    >
                      {activeModule ? (
                        <>
                          <p className="truncate font-medium" style={{ color: activeModule.color }}>
                            {activeModule.name}
                          </p>
                          <p className="text-muted-foreground">
                            {Math.round(activeModule.completion_progress.completed_fraction * 100)}% submitted
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-muted-foreground">achieved</p>
                          {totalWeight > 0 && (
                            <p className="text-muted-foreground/70">
                              {Math.round(overallCompletion.completed * 100)}% submitted
                            </p>
                          )}
                        </>
                      )}
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </div>

            {!showLegend ? null : totalWeight === 0 ? (
              <p className="text-xs text-muted-foreground">No modules yet.</p>
            ) : (
              <ul
                className="flex flex-wrap justify-center gap-x-1 gap-y-0.5 text-xs"
                onPointerLeave={() => setActiveModuleId(null)}
              >
                {legendModules.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onPointerEnter={() => setActiveModuleId(m.id)}
                      onFocus={() => setActiveModuleId(m.id)}
                      onBlur={() => setActiveModuleId(null)}
                      className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-opacity ${
                        activeModuleId !== null && activeModuleId !== m.id ? 'opacity-40' : ''
                      }`}
                    >
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: m.color }} aria-hidden />
                      <span>{m.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {Math.round(m.completion_progress.achieved_fraction * 100)}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </LoadSwap>
    </div>
  )
}
