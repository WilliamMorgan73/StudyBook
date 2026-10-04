import { Settings, ArrowLeft, BookX, RotateCcw, Star } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { DashboardWidget } from '@/components/dashboard/DashboardWidget'
import { LayoutEditControls } from '@/components/dashboard/LayoutEditControls'
import { ModuleContext, type ModuleData } from '@/components/dashboard/moduleContext'
import { MODULE_WIDGET_CONTENT } from '@/components/dashboard/moduleWidgetContent'
import { useLayoutEditor } from '@/components/dashboard/useLayoutEditor'
import { selectedDayLabel } from '@/components/dashboard/useOverviewCalendar'
import { ErrorState } from '@/components/ErrorState'
import { ModuleBanner } from '@/components/ModuleBanner'
import { ModuleBannerDialog } from '@/components/ModuleBannerDialog'
import { LinkMatchingSeriesDialog } from '@/components/LinkMatchingSeriesDialog'
import { ModuleSettingsDialog } from '@/components/ModuleSettingsDialog'
import { weekCalendarRange } from '@/components/ModuleWeekCalendar'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getAppSettings,
  getModule,
  listRevisionSessions,
  updateAppSettings,
  updateModule,
  updateRevisionSession,
  type RevisionSession,
} from '@/lib/api'
import { sameLayout } from '@/lib/dashboardLayout'
import { MODULE_DEFAULT_LAYOUT, MODULE_WIDGETS, moduleBoard, type ModuleWidgetId } from '@/lib/moduleLayout'
import { normalizeBanner } from '@/lib/moduleBanner'
import { enter } from '@/lib/motion'
import { useAsync } from '@/lib/useAsync'

/** How far ahead the Upcoming revision widget looks. */
const UPCOMING_REVISION_DAYS = 14


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
  // Set after a new course code is saved: offer the calendar series it matches.
  const [checkCodeMatches, setCheckCodeMatches] = useState(false)
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
  // Uncustomised modules (and Reset) use the user's default module layout, if they've set one.
  const appSettings = useAsync(() => getAppSettings(), [])
  const board = useMemo(() => moduleBoard(appSettings.data?.default_module_layout ?? null), [appSettings.data])
  const [savingDefault, setSavingDefault] = useState(false)
  const editor = useLayoutEditor(board, module?.dashboard_layout ?? null, async (layout) => {
    await updateModule(id, { dashboard_layout: layout })
    await refetch()
  })
  const { layout, editing } = editor

  // Every module without its own layout starts from this one from now on.
  async function makeDefault() {
    setSavingDefault(true)
    try {
      await updateAppSettings({ default_module_layout: sameLayout(layout, MODULE_DEFAULT_LAYOUT) ? null : layout })
      await appSettings.refetch()
    } finally {
      setSavingDefault(false)
    }
  }

  // Wait for settings too, so an uncustomised module doesn't flash the built-in layout first.
  if ((loading && !module) || (appSettings.loading && !appSettings.data)) {
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
      <div className="flex h-full flex-col overflow-hidden">
        <PageHeader
          left={
            <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" />
              <span>Overview</span>
            </Link>
          }
        />
        <div className="flex flex-1 items-center justify-center p-6">
          <ErrorState
            icon={BookX}
            iconVariant="muted"
            badge="404"
            title="Module not found"
            description="This module couldn't be found. It may have been deleted or the link is invalid."
            primaryAction={{
              label: 'Back to Overview',
              to: '/',
              icon: ArrowLeft,
            }}
            secondaryAction={{
              label: 'Try again',
              onClick: refetch,
              icon: RotateCcw,
            }}
          />
        </div>
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
    const { body, action, scroll } = MODULE_WIDGET_CONTENT[widgetId]
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
          <LayoutEditControls
            editor={editor}
            menuLabel="Add to this module"
            editingActions={
              <Button
                variant="ghost"
                size="sm"
                onClick={makeDefault}
                disabled={savingDefault || sameLayout(layout, board.defaultLayout)}
                title="Modules you haven't customised, and new ones, will use this layout"
              >
                <Star /> {sameLayout(layout, board.defaultLayout) ? 'Default layout' : 'Make default'}
              </Button>
            }
          >
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
        onLecturesChanged={refetch}
        onCodeSaved={() => setCheckCodeMatches(true)}
      />
      <LinkMatchingSeriesDialog
        moduleId={checkCodeMatches ? module.id : null}
        code={module.code}
        onClose={() => setCheckCodeMatches(false)}
        onLinked={refetch}
      />
    </motion.div>
  )
}
