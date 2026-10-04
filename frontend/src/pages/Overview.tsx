import { useMemo, useState, type ReactNode } from 'react'

import { BookOpen, Check, LayoutDashboard, Plus, RotateCcw, Settings } from 'lucide-react'

import { AppSettingsDialog } from '@/components/AppSettingsDialog'
import { AgendaWidget, CalendarWidget } from '@/components/dashboard/CalendarWidget'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { DashboardWidget } from '@/components/dashboard/DashboardWidget'
import {
  FlashcardsDueWidget,
  ModulesWidget,
  RevisionTodayWidget,
  UpcomingWidget,
} from '@/components/dashboard/ListWidgets'
import { OverviewContext, type OverviewData } from '@/components/dashboard/overviewContext'
import { ProgressWidget } from '@/components/dashboard/ProgressWidget'
import { selectedDayLabel, useOverviewCalendar } from '@/components/dashboard/useOverviewCalendar'
import { PageHeader } from '@/components/PageHeader'
import { QuickNotepad } from '@/components/QuickNotepad'
import { QuickTodoList } from '@/components/QuickTodoList'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { getAppSettings, listModules, updateAppSettings } from '@/lib/api'
import {
  addWidget,
  canAddWidget,
  DEFAULT_LAYOUT,
  hiddenWidgets,
  normalizeLayout,
  removeWidget,
  sameLayout,
  WIDGETS,
  type LayoutItem,
  type WidgetId,
} from '@/lib/dashboardLayout'
import { useAsync } from '@/lib/useAsync'

const WIDGET_BODIES: Record<WidgetId, ReactNode> = {
  calendar: <CalendarWidget />,
  agenda: <AgendaWidget />,
  upcoming: <UpcomingWidget />,
  todo: <QuickTodoList />,
  progress: <ProgressWidget />,
  notepad: <QuickNotepad />,
  modules: <ModulesWidget />,
  revisionToday: <RevisionTodayWidget />,
  flashcardsDue: <FlashcardsDueWidget />,
}

export function Overview() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  // The layout being edited; null when not in edit mode.
  const [draft, setDraft] = useState<LayoutItem[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const modules = useAsync(() => listModules(), [])
  const appSettings = useAsync(() => getAppSettings(), [])
  const calendar = useOverviewCalendar()

  const saved = useMemo(() => normalizeLayout(appSettings.data?.dashboard_layout ?? null), [appSettings.data])
  const editing = draft !== null
  const layout = draft ?? saved
  const hidden = hiddenWidgets(layout)

  const overview: OverviewData = {
    modules,
    appSettings: appSettings.data,
    calendar,
    agendaPlaced: layout.some((item) => item.i === 'agenda'),
    moduleName: (id) => modules.data?.find((m) => m.id === id)?.name ?? 'Unknown module',
    moduleColor: (id) => modules.data?.find((m) => m.id === id)?.color ?? 'var(--muted-foreground)',
  }

  function startEditing() {
    setSaveError(null)
    setDraft(saved)
  }

  async function saveLayout() {
    if (draft === null) return
    setSaving(true)
    setSaveError(null)
    try {
      // The default is stored as null, so it keeps tracking DEFAULT_LAYOUT if that changes.
      await updateAppSettings({ dashboard_layout: sameLayout(draft, DEFAULT_LAYOUT) ? null : draft })
      await appSettings.refetch()
      setDraft(null)
    } catch {
      setSaveError("Couldn't save the layout.")
    } finally {
      setSaving(false)
    }
  }

  function renderWidget(id: WidgetId, slot: number) {
    return (
      <DashboardWidget
        title={id === 'agenda' ? selectedDayLabel(calendar.selected) : WIDGETS[id].title}
        slot={slot}
        editing={editing}
        onRemove={() => setDraft((current) => removeWidget(current ?? saved, id))}
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
          editing ? (
            <div className="flex items-center gap-2">
              {saveError && <span className="text-sm text-destructive">{saveError}</span>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={hidden.length === 0}>
                    <Plus /> Add widget
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Add to your overview</DropdownMenuLabel>
                  {hidden.map((id) => {
                    const fits = canAddWidget(layout, id)
                    return (
                      <DropdownMenuItem
                        key={id}
                        disabled={!fits}
                        onSelect={() => setDraft((current) => addWidget(current ?? saved, id))}
                        className="flex-col items-start gap-0"
                      >
                        <span>{WIDGETS[id].title}</span>
                        <span className="text-xs text-muted-foreground">
                          {fits ? WIDGETS[id].description : 'No room left. Shrink or remove a widget first.'}
                        </span>
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDraft(DEFAULT_LAYOUT)}
                disabled={sameLayout(layout, DEFAULT_LAYOUT)}
              >
                <RotateCcw /> Reset
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={saveLayout}
                // An empty layout would load back as the default, so ask for at least one widget.
                disabled={saving || layout.length === 0}
              >
                <Check /> Done
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={startEditing} disabled={appSettings.data === null}>
                <LayoutDashboard /> Edit layout
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings /> Settings
              </Button>
            </div>
          )
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
            <DashboardGrid layout={layout} editing={editing} onLayoutChange={setDraft} renderWidget={renderWidget} />
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
