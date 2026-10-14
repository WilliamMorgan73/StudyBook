import { Eye, EyeOff } from 'lucide-react'

import { DayAgenda } from '@/components/dashboard/DayAgenda'
import { useOverview } from '@/components/dashboard/overviewContext'
import { useWidgetConfig } from '@/components/dashboard/widgetInstance'
import { selectedDayLabel } from '@/components/dashboard/useOverviewCalendar'
import { EventMarker } from '@/components/EventMarker'
import { LoadSwap } from '@/components/LoadSwap'
import { MonthCalendar } from '@/components/MonthCalendar'
import { Skeleton } from '@/components/ui/skeleton'
import { WidgetError } from '@/components/WidgetError'
import { calendarEventColor } from '@/lib/calendarFeeds'
import { DAY_LIST_CONFIG, type DayListSize } from '@/lib/dayList'

const LEGEND = [
  { kind: 'lecture', label: 'Lecture' },
  { kind: 'assignment_due', label: 'Assignment due' },
  { kind: 'exam', label: 'Exam' },
  { kind: 'revision', label: 'Revision' },
] as const

/** The day list's height under the month, by its size setting. */
const DAY_LIST_HEIGHT: Record<DayListSize, string> = { sm: 'h-16', md: 'h-24', lg: 'h-44' }

export function CalendarWidget() {
  const { calendar, agendaPlaced, moduleColor } = useOverview()
  const [cfg] = useWidgetConfig(DAY_LIST_CONFIG)
  const { month, setMonth, selected, selectDay, events, showBusy, toggleShowBusy } = calendar

  return (
    <>
      {calendar.calendar.error && (
        <WidgetError
          message="Couldn't load the calendar."
          onRetry={calendar.calendar.refetch}
          className="mb-2"
        />
      )}
      <LoadSwap
        loading={calendar.calendar.loading}
        skeleton={<Skeleton className="h-80 w-full" />}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        {calendar.calendar.data && (
          <>
            {/* A floor for the weeks, so a large day list can't squash them flat. */}
            <div className="flex min-h-60 flex-1 flex-col">
              <MonthCalendar
                month={month}
                onMonthChange={setMonth}
                events={events}
                selected={selected}
                onSelect={selectDay}
                eventColor={(event) => calendarEventColor(event, moduleColor)}
                fill
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {LEGEND.map(({ kind, label }) => (
                <span key={kind} className="flex items-center gap-1.5">
                  <EventMarker kind={kind} />
                  {label}
                </span>
              ))}
              <button
                type="button"
                onClick={toggleShowBusy}
                aria-pressed={showBusy}
                title={showBusy ? 'Hide busy time' : 'Show busy time'}
                className={`ml-auto flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground ${
                  showBusy ? '' : 'line-through opacity-60'
                }`}
              >
                <EventMarker kind="busy" />
                Busy
                {showBusy ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              </button>
            </div>
            {/* With no Day agenda widget on the dashboard, the selected day lists here instead (unless hidden). */}
            {!agendaPlaced && cfg.dayList && (
              // It gives way before the month does: in a short widget the list shrinks (and scrolls)
              // rather than squashing the weeks below their minimum height.
              <div className="flex min-h-0 flex-col border-t pt-2">
                <p className="mb-1.5 shrink-0 text-sm font-medium">{selectedDayLabel(selected)}</p>
                <div className={`${DAY_LIST_HEIGHT[cfg.dayListSize]} min-h-0 overflow-y-auto pr-1`}>
                  <DayAgenda />
                </div>
              </div>
            )}
          </>
        )}
      </LoadSwap>
    </>
  )
}

/** The Day agenda widget's body; its title (the selected date) is set by the widget shell. */
export function AgendaWidget() {
  const { calendar } = useOverview()
  if (calendar.calendar.data === null) {
    return calendar.calendar.loading ? <Skeleton className="h-16 w-full" /> : null
  }
  return <DayAgenda />
}
