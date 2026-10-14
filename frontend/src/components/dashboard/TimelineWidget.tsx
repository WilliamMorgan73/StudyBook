import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useModuleData } from '@/components/dashboard/moduleContext'
import { useOverview } from '@/components/dashboard/overviewContext'
import { useWidgetConfig } from '@/components/dashboard/widgetInstance'
import { EventMarker } from '@/components/EventMarker'
import { LoadSwap } from '@/components/LoadSwap'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WidgetError } from '@/components/WidgetError'
import { listUpcomingAssignments, type Assignment } from '@/lib/api'
import { useSampleData } from '@/lib/sampleData'
import {
  daysUntil,
  placeInLanes,
  positionOf,
  TIMELINE_CONFIG,
  TIMELINE_WEEKS,
  timelineAssignments,
  timelineRange,
  type TimelineWeeks,
} from '@/lib/timeline'
import { useAsync } from '@/lib/useAsync'
import { useElementSize } from '@/lib/useElementSize'

/** A chip's width (px): room for a short title. */
const CHIP_PX = 132
const LANE_PX = 30
/** Enough for every unfinished deadline in the next eight weeks. */
const FETCH_LIMIT = 200

function dueLabel(date: Date, today: Date, isExam: boolean): string {
  const days = daysUntil(date, today)
  const when =
    days < 0
      ? 'overdue'
      : days === 0
        ? 'today'
        : days === 1
          ? 'tomorrow'
          : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return `${isExam ? 'Exam' : 'Due'} ${when}`
}

/**
 * The next few weeks as a strip: week ticks along the top, today marked, and each deadline or exam
 * as a chip in its module's colour at its date. Chips that would overlap stack in lanes.
 */
function DeadlineTimeline({
  assignments,
  weeks,
  colorOf,
  moduleNameOf,
}: {
  assignments: readonly Assignment[]
  weeks: number
  colorOf: (a: Assignment) => string
  moduleNameOf?: (a: Assignment) => string
}) {
  const [sizeRef, size] = useElementSize<HTMLDivElement>()
  const [today] = useState(() => new Date())
  const { start, end, weekStarts } = timelineRange(today, weeks)
  const items = timelineAssignments(assignments, start, end)
  const chipShare = size.width > 0 ? Math.min(1, CHIP_PX / size.width) : 0.25
  const placed = placeInLanes(
    items.map((a) => ({ item: a, pos: positionOf(new Date(a.due_at!), start, end) })),
    chipShare,
  )
  const lanes = Math.max(1, ...placed.map((p) => p.lane + 1))
  const todayPos = positionOf(today, start, end)
  // On a narrow strip, label every other week so the dates don't collide.
  const labelEvery = size.width > 0 && size.width / weeks < 56 ? 2 : 1

  return (
    <div ref={sizeRef} className="relative min-h-full">
      {/* Week ticks: a line at each Monday, its date above. */}
      <div className="relative h-5 text-[11px] text-muted-foreground">
        {weekStarts.map((week, i) =>
          i % labelEvery === 0 ? (
            <span key={week.toISOString()} className="absolute top-0 pl-1 whitespace-nowrap" style={{ left: `${(i / weeks) * 100}%` }}>
              {week.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </span>
          ) : null,
        )}
      </div>
      <div className="relative" style={{ height: lanes * LANE_PX + 8 }}>
        {weekStarts.map((week, i) => (
          <div
            key={week.toISOString()}
            aria-hidden
            className="absolute inset-y-0 border-l border-border"
            style={{ left: `${(i / weeks) * 100}%` }}
          />
        ))}
        <div
          aria-hidden
          title="Today"
          className="absolute inset-y-0 z-10 border-l-2 border-primary"
          style={{ left: `${todayPos * 100}%` }}
        />
        {placed.map(({ item: a, pos, lane }) => {
          const due = new Date(a.due_at!)
          const isExam = a.kind === 'exam'
          const color = colorOf(a)
          return (
            <Tooltip key={a.id}>
              <TooltipTrigger asChild>
                <Link
                  to={`/modules/${a.module_id}/assignments/${a.id}`}
                  className="absolute z-20 flex h-6 items-center gap-1.5 overflow-hidden rounded-md border bg-card px-1.5 text-xs shadow-xs transition-colors hover:bg-muted"
                  style={{
                    left: `${Math.min(pos, 1 - chipShare) * 100}%`,
                    top: 4 + lane * LANE_PX,
                    width: CHIP_PX - 4,
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  <EventMarker kind={isExam ? 'exam' : 'assignment_due'} color={color} className="shrink-0" />
                  <span className="truncate">{a.title}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">{a.title}</p>
                <p className="opacity-80">
                  {moduleNameOf ? `${moduleNameOf(a)} · ` : ''}
                  {dueLabel(due, today, isExam)}
                </p>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      {items.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">Nothing due in the next {weeks} weeks.</p>
      )}
    </div>
  )
}

export function TimelineWidget() {
  const [cfg] = useWidgetConfig(TIMELINE_CONFIG)
  const { moduleColor, moduleName } = useOverview()
  const sample = useSampleData()
  const assignments = useAsync(
    () => (sample ? Promise.resolve(sample.upcomingAssignments) : listUpcomingAssignments(FETCH_LIMIT)),
    [],
  )
  return (
    <>
      {assignments.error && <WidgetError message="Couldn't load deadlines." onRetry={assignments.refetch} className="mb-2" />}
      <LoadSwap loading={assignments.loading} skeleton={<Skeleton className="h-24 w-full" />}>
        {assignments.data && (
          <DeadlineTimeline
            assignments={assignments.data}
            weeks={cfg.weeks}
            colorOf={(a) => moduleColor(a.module_id)}
            moduleNameOf={(a) => moduleName(a.module_id)}
          />
        )}
      </LoadSwap>
    </>
  )
}

export function ModuleTimelineWidget() {
  const [cfg] = useWidgetConfig(TIMELINE_CONFIG)
  const { module } = useModuleData()
  return <DeadlineTimeline assignments={module.assignments} weeks={cfg.weeks} colorOf={() => module.color} />
}

export function TimelineSettings() {
  const [cfg, setCfg] = useWidgetConfig(TIMELINE_CONFIG)
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Show the next</Label>
      <Tabs value={String(cfg.weeks)} onValueChange={(v) => setCfg({ weeks: Number(v) as TimelineWeeks })}>
        <TabsList className="w-full">
          {TIMELINE_WEEKS.map((weeks) => (
            <TabsTrigger key={weeks} value={String(weeks)}>
              {weeks} weeks
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
