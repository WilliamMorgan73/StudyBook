import { useState, type ReactNode } from 'react'

import { BookOpen, Settings } from 'lucide-react'

import { AppSettingsDialog } from '@/components/AppSettingsDialog'
import { AgendaWidget, CalendarWidget } from '@/components/dashboard/CalendarWidget'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { DashboardWidget } from '@/components/dashboard/DashboardWidget'
import { LayoutEditControls } from '@/components/dashboard/LayoutEditControls'
import {
  FlashcardsDueWidget,
  ModulesWidget,
  RevisionTodayWidget,
  TodoWidget,
  UpcomingWidget,
} from '@/components/dashboard/ListWidgets'
import { OverviewContext, type OverviewData } from '@/components/dashboard/overviewContext'
import { ProgressWidget } from '@/components/dashboard/ProgressWidget'
import { useLayoutEditor } from '@/components/dashboard/useLayoutEditor'
import { selectedDayLabel, useOverviewCalendar } from '@/components/dashboard/useOverviewCalendar'
import { PageHeader } from '@/components/PageHeader'
import { QuickNotepad } from '@/components/QuickNotepad'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getAppSettings, listModules, updateAppSettings } from '@/lib/api'
import { OVERVIEW_BOARD, WIDGETS, type WidgetId } from '@/lib/dashboardLayout'
import { useAsync } from '@/lib/useAsync'

const WIDGET_BODIES: Record<WidgetId, ReactNode> = {
  calendar: <CalendarWidget />,
  agenda: <AgendaWidget />,
  upcoming: <UpcomingWidget />,
  todo: <TodoWidget />,
  progress: <ProgressWidget />,
  notepad: <QuickNotepad />,
  modules: <ModulesWidget />,
  revisionToday: <RevisionTodayWidget />,
  flashcardsDue: <FlashcardsDueWidget />,
}

export function Overview() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  const modules = useAsync(() => listModules(), [])
  const appSettings = useAsync(() => getAppSettings(), [])
  const calendar = useOverviewCalendar()

  const editor = useLayoutEditor(OVERVIEW_BOARD, appSettings.data?.dashboard_layout ?? null, async (layout) => {
    await updateAppSettings({ dashboard_layout: layout })
    await appSettings.refetch()
  })
  const { layout, editing } = editor

  const overview: OverviewData = {
    modules,
    appSettings: appSettings.data,
    calendar,
    agendaPlaced: layout.some((item) => item.i === 'agenda'),
    moduleName: (id) => modules.data?.find((m) => m.id === id)?.name ?? 'Unknown module',
    moduleColor: (id) => modules.data?.find((m) => m.id === id)?.color ?? 'var(--muted-foreground)',
  }

  function renderWidget(id: WidgetId, slot: number) {
    return (
      <DashboardWidget
        title={id === 'agenda' ? selectedDayLabel(calendar.selected) : WIDGETS[id].title}
        slot={slot}
        editing={editing}
        onRemove={() => editor.remove(id)}
      >
        {WIDGET_BODIES[id]}
      </DashboardWidget>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        left={
          <div className="flex items-center gap-2">
            <BookOpen className="size-6" />
            <span className="text-lg font-semibold">StudyBook</span>
          </div>
        }
        right={
          <LayoutEditControls
            editor={editor}
            menuLabel="Add to your overview"
            disabled={appSettings.data === null}
          >
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings /> Settings
            </Button>
          </LayoutEditControls>
        }
      />

      <div className="min-h-0 flex-1 px-6 py-4">
        {appSettings.data === null && appSettings.loading ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : (
          <OverviewContext value={overview}>
            {editing && layout.length === 0 && (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Your overview is empty. Use <span className="font-medium text-foreground">Add widget</span> to put
                something on it.
              </p>
            )}
            <DashboardGrid
              widgets={WIDGETS}
              layout={layout}
              editing={editing}
              onLayoutChange={editor.setDraft}
              renderWidget={renderWidget}
            />
          </OverviewContext>
        )}
      </div>

      {appSettings.data && (
        <AppSettingsDialog
          settings={appSettings.data}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onChanged={appSettings.refetch}
          onCalendarChanged={calendar.calendar.refetch}
        />
      )}
    </div>
  )
}
