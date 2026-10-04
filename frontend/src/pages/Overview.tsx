import { useState } from 'react'

import { BookOpen, RotateCcw, Settings, WifiOff } from 'lucide-react'

import { AppSettingsDialog } from '@/components/AppSettingsDialog'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { DashboardWidget } from '@/components/dashboard/DashboardWidget'
import { LayoutEditControls } from '@/components/dashboard/LayoutEditControls'
import { OVERVIEW_WIDGET_CONTENT } from '@/components/dashboard/overviewWidgetContent'
import { OverviewContext, type OverviewData } from '@/components/dashboard/overviewContext'
import { useLayoutEditor } from '@/components/dashboard/useLayoutEditor'
import { selectedDayLabel, useOverviewCalendar } from '@/components/dashboard/useOverviewCalendar'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getAppSettings, listModules, updateAppSettings } from '@/lib/api'
import { OVERVIEW_BOARD, WIDGETS, type WidgetId } from '@/lib/dashboardLayout'
import { useAsync } from '@/lib/useAsync'


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
        // The ring sizes itself to the widget, dropping its legend and caption when they don't fit.
        scroll={id !== 'progress'}
      >
        {OVERVIEW_WIDGET_CONTENT[id]}
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
        ) : appSettings.data === null ? (
          <div className="flex h-full items-center justify-center">
            <ErrorState
              icon={WifiOff}
              iconVariant="warning"
              badge="Server offline"
              title="Cannot connect to StudyBook server"
              description="Couldn't connect to the local StudyBook backend. Make sure the server is running, then try again."
              codeSnippet="uv run uvicorn app.main:app"
              primaryAction={{
                label: 'Retry connection',
                onClick: async () => {
                  await Promise.all([appSettings.refetch(), modules.refetch(), calendar.calendar.refetch()])
                },
                icon: RotateCcw,
              }}
            />
          </div>
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
