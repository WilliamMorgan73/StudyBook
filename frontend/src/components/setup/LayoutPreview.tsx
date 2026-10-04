import { useMemo, useState } from 'react'

import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { DashboardWidget } from '@/components/dashboard/DashboardWidget'
import { ModuleContext, type ModuleData } from '@/components/dashboard/moduleContext'
import { MODULE_WIDGET_CONTENT } from '@/components/dashboard/moduleWidgetContent'
import { OverviewContext, type OverviewData } from '@/components/dashboard/overviewContext'
import { OVERVIEW_WIDGET_CONTENT } from '@/components/dashboard/overviewWidgetContent'
import { selectedDayLabel, useOverviewCalendar } from '@/components/dashboard/useOverviewCalendar'
import { ModuleBanner } from '@/components/ModuleBanner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AppSettings, RevisionSession } from '@/lib/api'
import { WIDGETS, type LayoutItem, type WidgetId } from '@/lib/dashboardLayout'
import { normalizeBanner } from '@/lib/moduleBanner'
import { MODULE_WIDGETS, type ModuleWidgetId } from '@/lib/moduleLayout'
import { buildSampleData, SampleDataContext, type SampleData } from '@/lib/sampleData'
import type { AsyncState } from '@/lib/useAsync'

function loaded<T>(data: T): AsyncState<T> {
  return { data, error: null, loading: false, refetch: async () => {} }
}

const noop = async () => {}

/**
 * A full-size, read-only look at a module page or the Overview with `layout`, filled with sample
 * data (`lib/sampleData.ts`) instead of the user's. Inert, so nothing in it can be clicked or saved.
 */
export function LayoutPreviewDialog({
  open,
  onOpenChange,
  page,
  layout,
  accent,
  label,
  settings,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  page: 'module' | 'overview'
  layout: LayoutItem<string>[]
  /** The first module's colour, so the sample module looks like theirs. */
  accent: string
  /** The layout's name, for the title. */
  label: string
  settings: AppSettings
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(90vh,60rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,90rem)]">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle>
            {label} {page === 'module' ? 'module page' : 'Overview'}
          </DialogTitle>
          <DialogDescription>Sample data, to show how the layout fills up. Nothing here is saved.</DialogDescription>
        </DialogHeader>
        {open && (
          // inert: a picture of the page, not a working copy of it.
          <div inert className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            <Preview page={page} layout={layout} accent={accent} settings={settings} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Preview({
  page,
  layout,
  accent,
  settings,
}: {
  page: 'module' | 'overview'
  layout: LayoutItem<string>[]
  accent: string
  settings: AppSettings
}) {
  const sample = useMemo(() => buildSampleData(new Date(), accent), [accent])
  return (
    <SampleDataContext value={sample}>
      {page === 'module' ? (
        <ModulePreview sample={sample} layout={layout as LayoutItem<ModuleWidgetId>[]} />
      ) : (
        <OverviewPreview sample={sample} layout={layout as LayoutItem<WidgetId>[]} settings={settings} />
      )}
    </SampleDataContext>
  )
}

function ModulePreview({ sample, layout }: { sample: SampleData; layout: LayoutItem<ModuleWidgetId>[] }) {
  const [selectedDay, setSelectedDay] = useState(() => new Date())
  const sessions: RevisionSession[] = sample.revisionSessions
  const data: ModuleData = {
    module: sample.module,
    refetch: noop,
    weekSessions: loaded(sessions),
    upcomingSessions: loaded(sessions),
    setRevisionDone: noop,
    selectedDay,
    setSelectedDay,
    dayAgendaPlaced: layout.some((item) => item.i === 'dayAgenda'),
  }

  return (
    <ModuleContext value={data}>
      <ModuleBanner module={sample.module} config={normalizeBanner(null)} editing={false} onCustomise={() => {}} />
      <div className="min-h-0 flex-1 px-6 py-4">
        <DashboardGrid
          widgets={MODULE_WIDGETS}
          layout={layout}
          editing={false}
          onLayoutChange={() => {}}
          renderWidget={(id, slot) => {
            const { body, action, scroll } = MODULE_WIDGET_CONTENT[id]
            return (
              <DashboardWidget
                title={id === 'dayAgenda' ? selectedDayLabel(selectedDay) : MODULE_WIDGETS[id].title}
                slot={slot + 1}
                editing={false}
                onRemove={() => {}}
                action={action}
                scroll={scroll}
              >
                {body}
              </DashboardWidget>
            )
          }}
        />
      </div>
    </ModuleContext>
  )
}

function OverviewPreview({
  sample,
  layout,
  settings,
}: {
  sample: SampleData
  layout: LayoutItem<WidgetId>[]
  settings: AppSettings
}) {
  // Reads the sample calendar through SampleDataContext.
  const calendar = useOverviewCalendar()
  const data: OverviewData = {
    modules: loaded(sample.modules),
    // Their own settings, but no credit cap: it would hide the sample's "Add module" tile.
    appSettings: { ...settings, max_credits: null },
    calendar,
    agendaPlaced: layout.some((item) => item.i === 'agenda'),
    moduleName: (id) => sample.modules.find((m) => m.id === id)?.name ?? 'Unknown module',
    moduleColor: (id) => sample.modules.find((m) => m.id === id)?.color ?? 'var(--muted-foreground)',
  }

  return (
    <OverviewContext value={data}>
      <div className="min-h-0 flex-1 px-6 py-4">
        <DashboardGrid
          widgets={WIDGETS}
          layout={layout}
          editing={false}
          onLayoutChange={() => {}}
          renderWidget={(id, slot) => (
            <DashboardWidget
              title={id === 'agenda' ? selectedDayLabel(calendar.selected) : WIDGETS[id].title}
              slot={slot}
              editing={false}
              onRemove={() => {}}
              scroll={id !== 'progress'}
            >
              {OVERVIEW_WIDGET_CONTENT[id]}
            </DashboardWidget>
          )}
        />
      </div>
    </OverviewContext>
  )
}
