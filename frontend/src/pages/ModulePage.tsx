import { Settings, ArrowLeft } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'

import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { DashboardWidget } from '@/components/dashboard/DashboardWidget'
import { LayoutEditControls } from '@/components/dashboard/LayoutEditControls'
import { ModuleContext, type ModuleData } from '@/components/dashboard/moduleContext'
import {
  AssignmentsAction,
  AssignmentsWidget,
  DayAgendaWidget,
  ExamsWidget,
  FlashcardsAction,
  FlashcardsWidget,
  GradesWidget,
  LecturesWidget,
  ModuleNotepadWidget,
  ModuleProgressWidget,
  ModuleTodoWidget,
  OpenTodosWidget,
  RelatedModulesWidget,
  RevisionWidget,
  ScheduleWidget,
  SubmodulesAction,
  SubmodulesWidget,
} from '@/components/dashboard/ModuleWidgets'
import { useLayoutEditor } from '@/components/dashboard/useLayoutEditor'
import { selectedDayLabel } from '@/components/dashboard/useOverviewCalendar'
import { ModuleBanner } from '@/components/ModuleBanner'
import { ModuleBannerDialog } from '@/components/ModuleBannerDialog'
import { ModuleSettingsDialog } from '@/components/ModuleSettingsDialog'
import { weekCalendarRange } from '@/components/ModuleWeekCalendar'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getModule, listRevisionSessions, updateModule, updateRevisionSession, type RevisionSession } from '@/lib/api'
import { MODULE_BOARD, MODULE_WIDGETS, type ModuleWidgetId } from '@/lib/moduleLayout'
import { normalizeBanner } from '@/lib/moduleBanner'
import { enter } from '@/lib/motion'
import { useAsync } from '@/lib/useAsync'

/** How far ahead the Upcoming revision widget looks. */
const UPCOMING_REVISION_DAYS = 14

const WIDGET_CONTENT: Record<ModuleWidgetId, { body: ReactNode; action?: ReactNode; scroll?: boolean }> = {
  schedule: { body: <ScheduleWidget /> },
  dayAgenda: { body: <DayAgendaWidget /> },
  submodules: { body: <SubmodulesWidget />, action: <SubmodulesAction /> },
  assignments: { body: <AssignmentsWidget />, action: <AssignmentsAction /> },
  flashcards: { body: <FlashcardsWidget />, action: <FlashcardsAction /> },
  revision: { body: <RevisionWidget /> },
  // The ring sizes itself to the widget, dropping its legend and caption when they don't fit.
  progress: { body: <ModuleProgressWidget />, scroll: false },
  exams: { body: <ExamsWidget /> },
  lectures: { body: <LecturesWidget /> },
  grades: { body: <GradesWidget /> },
  openTodos: { body: <OpenTodosWidget /> },
  todo: { body: <ModuleTodoWidget /> },
  notepad: { body: <ModuleNotepadWidget /> },
  related: { body: <RelatedModulesWidget /> },
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
  const [bannerOpen, setBannerOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState(() => new Date())
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
    selectedDay,
    setSelectedDay,
    dayAgendaPlaced: layout.some((item) => item.i === 'dayAgenda'),
  }

  function renderWidget(widgetId: ModuleWidgetId, slot: number) {
    const { body, action, scroll } = WIDGET_CONTENT[widgetId]
    return (
      <DashboardWidget
        title={widgetId === 'dayAgenda' ? selectedDayLabel(selectedDay) : MODULE_WIDGETS[widgetId].title}
        slot={slot + 1}
        editing={editing}
        onRemove={() => editor.remove(widgetId)}
        action={action}
        scroll={scroll}
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

      <ModuleBanner
        module={module}
        config={normalizeBanner(module.banner)}
        editing={editing}
        onCustomise={() => setBannerOpen(true)}
      />

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

      <ModuleBannerDialog module={module} open={bannerOpen} onOpenChange={setBannerOpen} onSaved={refetch} />
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
