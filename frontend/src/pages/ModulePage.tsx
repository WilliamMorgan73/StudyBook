import { Settings, ArrowLeft } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Countdown } from '@/components/Countdown'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { DashboardWidget } from '@/components/dashboard/DashboardWidget'
import { LayoutEditControls } from '@/components/dashboard/LayoutEditControls'
import { ModuleContext, type ModuleData } from '@/components/dashboard/moduleContext'
import {
  AssignmentsAction,
  AssignmentsWidget,
  FlashcardsAction,
  FlashcardsWidget,
  ModuleProgressWidget,
  RelatedModulesWidget,
  RevisionWidget,
  ScheduleWidget,
  SubmodulesAction,
  SubmodulesWidget,
} from '@/components/dashboard/ModuleWidgets'
import { useLayoutEditor } from '@/components/dashboard/useLayoutEditor'
import { ModuleProgressRing } from '@/components/ModuleProgressRing'
import { AnimatedNumber } from '@/components/RadialProgress'
import { ModuleSettingsDialog } from '@/components/ModuleSettingsDialog'
import { weekCalendarRange } from '@/components/ModuleWeekCalendar'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getModule, listRevisionSessions, updateModule, updateRevisionSession, type RevisionSession } from '@/lib/api'
import { MODULE_BOARD, MODULE_WIDGETS, type ModuleWidgetId } from '@/lib/moduleLayout'
import { enter, fadeUpAt } from '@/lib/motion'
import { useAsync } from '@/lib/useAsync'

/** How far ahead the Upcoming revision widget looks. */
const UPCOMING_REVISION_DAYS = 14

const WIDGET_CONTENT: Record<ModuleWidgetId, { body: ReactNode; action?: ReactNode }> = {
  schedule: { body: <ScheduleWidget /> },
  submodules: { body: <SubmodulesWidget />, action: <SubmodulesAction /> },
  assignments: { body: <AssignmentsWidget />, action: <AssignmentsAction /> },
  flashcards: { body: <FlashcardsWidget />, action: <FlashcardsAction /> },
  revision: { body: <RevisionWidget /> },
  progress: { body: <ModuleProgressWidget /> },
  related: { body: <RelatedModulesWidget /> },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function upcomingRevisionRange(today: Date) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + UPCOMING_REVISION_DAYS)
  return { start, end }
}

export function ModulePage() {
  const { moduleId } = useParams()
  // Keyed by module, so a layout being edited doesn't carry over to the next module.
  return <ModuleView key={moduleId} id={Number(moduleId)} />
}

function ModuleView({ id }: { id: number }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { data: module, loading, refetch } = useAsync(() => getModule(id), [id])
  const weekRange = useMemo(() => weekCalendarRange(new Date()), [])
  const upcomingRange = useMemo(() => upcomingRevisionRange(new Date()), [])
  const weekSessions = useAsync(
    () => listRevisionSessions({ moduleId: id, start: weekRange.start, end: weekRange.end }),
    [id, weekRange],
  )
  const upcomingSessions = useAsync(
    () => listRevisionSessions({ moduleId: id, start: upcomingRange.start, end: upcomingRange.end }),
    [id, upcomingRange],
  )
  const editor = useLayoutEditor(MODULE_BOARD, module?.dashboard_layout ?? null, async (layout) => {
    await updateModule(id, { dashboard_layout: layout })
    await refetch()
  })
  const { layout, editing } = editor
  const slotProps = (i: number) => ({ variants: fadeUpAt, custom: i })

  if (loading && !module) {
    return (
      <div className="space-y-4 px-8 py-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  // Not loading and no data means the first load failed; a failed refresh keeps the data.
  if (!module) {
    return (
      <div className="space-y-4 px-8 py-8">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Overview
        </Link>
        <p className="text-sm text-destructive">This module couldn't be found.</p>
      </div>
    )
  }

  const data: ModuleData = {
    module,
    refetch,
    weekSessions,
    upcomingSessions,
    setRevisionDone: async (session: RevisionSession, done: boolean) => {
      await updateRevisionSession(session.id, { done })
      await Promise.all([weekSessions.refetch(), upcomingSessions.refetch()])
    },
  }

  function renderWidget(widgetId: ModuleWidgetId, slot: number) {
    const { body, action } = WIDGET_CONTENT[widgetId]
    return (
      <DashboardWidget
        title={MODULE_WIDGETS[widgetId].title}
        slot={slot + 1}
        editing={editing}
        onRemove={() => editor.remove(widgetId)}
        action={action}
      >
        {body}
      </DashboardWidget>
    )
  }

  return (
    <motion.div className="flex h-full flex-col overflow-hidden" {...enter}>
      <PageHeader
        left={
          <Link to="/" className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4 shrink-0" />
            <span className="truncate">Overview</span>
          </Link>
        }
        right={
          <LayoutEditControls editor={editor} menuLabel="Add to this module">
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings /> Settings
            </Button>
          </LayoutEditControls>
        }
      />

      <motion.div className="shrink-0 border-b" style={{ backgroundColor: `${module.color}1f` }} {...slotProps(0)}>
        <div className="flex items-center gap-5 px-6 py-4">
          <ModuleProgressRing progress={module.completion_progress} color={module.color} size={56} strokeWidth={7} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold">{module.name}</h1>
            {(module.code || module.term || module.credits !== null) && (
              <p className="text-sm text-muted-foreground">
                {[module.code, module.term, module.credits !== null ? `${module.credits} credits` : null]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-8 text-right">
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                {module.current_grade !== null ? (
                  <>
                    <AnimatedNumber value={module.current_grade} decimals={1} />%
                  </>
                ) : (
                  '—'
                )}
              </p>
              <p className="text-sm text-muted-foreground">Current grade</p>
            </div>
            <div>
              <Countdown target={module.next_lecture_at} />
              <p className="mt-0.5 text-sm text-muted-foreground">
                Next lecture{module.next_lecture_at && ` · ${formatDate(module.next_lecture_at)}`}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="min-h-0 flex-1 px-6 py-4">
        <ModuleContext value={data}>
          {editing && layout.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              This page is empty. Use <span className="font-medium text-foreground">Add widget</span> to put something
              on it.
            </p>
          )}
          <DashboardGrid
            widgets={MODULE_WIDGETS}
            layout={layout}
            editing={editing}
            onLayoutChange={editor.setDraft}
            renderWidget={renderWidget}
          />
        </ModuleContext>
      </div>

      <ModuleSettingsDialog
        module={module}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onChanged={() => {
          setSettingsOpen(false)
          refetch()
        }}
      />
    </motion.div>
  )
}
