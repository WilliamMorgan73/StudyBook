import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { BookOpen, Eye, EyeOff, Settings } from 'lucide-react'

import { AddModuleDialog } from '@/components/AddModuleDialog'
import { AddModuleTile } from '@/components/AddModuleTile'
import { AppSettingsDialog } from '@/components/AppSettingsDialog'
import { AssignmentItem } from '@/components/AssignmentItem'
import { EventMarker } from '@/components/EventMarker'
import { calendarGridRange, MonthCalendar } from '@/components/MonthCalendar'
import { ModuleCard } from '@/components/ModuleCard'
import { PageHeader } from '@/components/PageHeader'
import { RadialProgress } from '@/components/RadialProgress'
import { QuickNotepad } from '@/components/QuickNotepad'
import { QuickTodoList } from '@/components/QuickTodoList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getAppSettings, getCalendar, listModules, listUpcomingAssignments } from '@/lib/api'
import { calendarEventKey, visibleCalendarEvents } from '@/lib/busyTime'
import { progressRingSegments } from '@/lib/progress'
import { useAsync } from '@/lib/useAsync'

const SHOW_BUSY_KEY = 'studybook.overview.showBusy'

function readShowBusy() {
  try {
    return localStorage.getItem(SHOW_BUSY_KEY) !== 'false'
  } catch {
    return true
  }
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function Overview() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selected, setSelected] = useState(() => new Date())
  const [expandedEventKey, setExpandedEventKey] = useState<string | null>(null)
  const [showBusy, setShowBusy] = useState(readShowBusy)

  function toggleShowBusy() {
    const next = !showBusy
    setShowBusy(next)
    try {
      localStorage.setItem(SHOW_BUSY_KEY, String(next))
    } catch {
      // Storage unavailable: the toggle still works for this visit.
    }
  }

  const gridRange = useMemo(() => calendarGridRange(month), [month])

  const modules = useAsync(() => listModules(), [])
  const assignments = useAsync(() => listUpcomingAssignments(6), [])
  // Keep the current month on screen until the next one loads, so paging doesn't blink.
  const calendar = useAsync(() => getCalendar(gridRange.start, gridRange.end), [gridRange], {
    keepPreviousData: true,
  })
  const appSettings = useAsync(() => getAppSettings(), [])

  const maxCredits = appSettings.data?.max_credits ?? null
  const usedCredits = (modules.data ?? []).reduce((sum, m) => sum + (m.credits ?? 0), 0)
  const hasCreditRoom = maxCredits === null || usedCredits < maxCredits

  const moduleName = (id: number) => modules.data?.find((m) => m.id === id)?.name ?? 'Unknown module'
  const moduleColor = (id: number | null) =>
    modules.data?.find((m) => m.id === id)?.color ?? 'var(--muted-foreground)'

  const events = useMemo(() => visibleCalendarEvents(calendar.data ?? [], showBusy), [calendar.data, showBusy])
  const selectedDayEvents = useMemo(
    () => events.filter((e) => isSameDay(new Date(e.starts_at), selected)),
    [events, selected],
  )

  // Credit-weighted (falling back to equal weight when credits aren't set) so the aggregate ring
  // matches each module's own ring: achieved% of grade in the module's own color, the rest of
  // what's been submitted/graded but fell short of full marks in a faded shade of it.
  const totalWeight = (modules.data ?? []).reduce((sum, m) => sum + (m.credits ?? 1), 0)

  const progressSegments = useMemo(() => {
    if (totalWeight === 0) return []
    return (modules.data ?? []).flatMap((m) => {
      const share = (m.credits ?? 1) / totalWeight
      return progressRingSegments(m.completion_progress, m.color, share)
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

  return (
    <div className="min-h-full">
      <PageHeader
        left={
          <div className="flex items-center gap-2">
            <BookOpen className="size-6" />
            <span className="text-lg font-semibold">StudyBook</span>
          </div>
        }
        right={
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings /> Settings
          </Button>
        }
      />

      <div className="space-y-8 px-8 py-8">
        <div className="grid gap-6 lg:grid-cols-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Calendar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {calendar.loading && <Skeleton className="h-80 w-full" />}
              {calendar.error && <p className="text-sm text-destructive">Couldn't load the calendar.</p>}
              {calendar.data && (
                <>
                  <MonthCalendar
                    month={month}
                    onMonthChange={setMonth}
                    events={events}
                    selected={selected}
                    onSelect={(date) => {
                      setSelected(date)
                      setExpandedEventKey(null)
                    }}
                    eventColor={(event) => moduleColor(event.module_id)}
                  />
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <EventMarker kind="lecture" />
                      Lecture
                    </span>
                    <span className="flex items-center gap-1.5">
                      <EventMarker kind="assignment_due" />
                      Assignment due
                    </span>
                    <span className="flex items-center gap-1.5">
                      <EventMarker kind="exam" />
                      Exam
                    </span>
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
                  <div className="border-t pt-2">
                    <p className="mb-1.5 text-sm font-medium">
                      {selected.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                    <div className="h-24 overflow-y-auto pr-1">
                    {selectedDayEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nothing scheduled this day.</p>
                    ) : (
                      <ul className="space-y-1">
                        {selectedDayEvents.map((event) => {
                          const key = calendarEventKey(event)
                          const isExpanded = expandedEventKey === key
                          const isBusy = event.kind === 'busy'
                          return (
                            <li key={key}>
                              <button
                                type="button"
                                onClick={() => setExpandedEventKey(isExpanded ? null : key)}
                                className="-mx-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                              >
                                <EventMarker
                                  kind={event.kind}
                                  color={moduleColor(event.module_id)}
                                  className="shrink-0"
                                />
                                <span className={`truncate ${isBusy ? 'text-muted-foreground' : ''}`}>{event.title}</span>
                                {event.module_id !== null && (
                                  <span className="text-muted-foreground">{moduleName(event.module_id)}</span>
                                )}
                                <span className="ml-auto shrink-0 text-muted-foreground">
                                  {event.kind === 'assignment_due'
                                    ? 'Due'
                                    : new Date(event.starts_at).toLocaleTimeString(undefined, {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}
                                </span>
                              </button>
                              {isExpanded && event.kind !== 'assignment_due' && (
                                <div className="ml-4 space-y-0.5 px-2 pb-2 text-xs text-muted-foreground">
                                  <p>
                                    {new Date(event.starts_at).toLocaleTimeString(undefined, {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                    })}
                                    {event.ends_at &&
                                      ` – ${new Date(event.ends_at).toLocaleTimeString(undefined, {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}`}
                                  </p>
                                  {event.location && <p>{event.location}</p>}
                                  {isBusy && <p>Personal event (Settings → Calendars)</p>}
                                  {event.url && (
                                    <Link to={event.url} className="inline-block text-foreground hover:underline">
                                      {event.kind === 'exam' ? 'Open exam' : 'Open module'} &rarr;
                                    </Link>
                                  )}
                                </div>
                              )}
                              {isExpanded && event.kind === 'assignment_due' && event.url && (
                                <div className="ml-4 space-y-0.5 px-2 pb-2 text-xs text-muted-foreground">
                                  <Link to={event.url} className="inline-block text-foreground hover:underline">
                                    Open assignment &rarr;
                                  </Link>
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card className="flex-1">
              <CardHeader>
                <CardTitle>Upcoming assignments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {assignments.loading && <Skeleton className="h-40 w-full" />}
                {assignments.error && <p className="text-sm text-destructive">Couldn't load assignments.</p>}
                {assignments.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground">{"Nothing due — you're all caught up."}</p>
                )}
                {assignments.data?.map((a) => (
                  <AssignmentItem key={a.id} assignment={a} moduleName={moduleName(a.module_id)} />
                ))}
              </CardContent>
            </Card>

            <Card className="flex-1">
              <CardHeader>
                <CardTitle>To-do</CardTitle>
              </CardHeader>
              <CardContent>
                <QuickTodoList />
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card className="flex-1">
              <CardHeader>
                <CardTitle>Progress</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 items-center justify-center">
                {modules.loading && <Skeleton className="size-32 rounded-full" />}
                {modules.data && (
                  <div className="relative flex items-center justify-center">
                    <RadialProgress segments={progressSegments} size={136} strokeWidth={13} />

                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center transition-opacity group-hover/card:opacity-0">
                      <p className="text-3xl font-semibold tabular-nums">
                        {totalWeight === 0 ? '—' : `${Math.round(overallCompletion.achieved * 100)}%`}
                      </p>
                      <p className="text-xs text-muted-foreground">achieved</p>
                    </div>

                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-card/95 p-4 text-center opacity-0 transition-opacity group-hover/card:opacity-100">
                      {totalWeight === 0 ? (
                        <p className="text-xs text-muted-foreground">No modules yet.</p>
                      ) : (
                        <>
                          <div>
                            <p className="text-sm font-medium">{Math.round(overallCompletion.achieved * 100)}% achieved</p>
                            <p className="text-xs text-muted-foreground">
                              {Math.round(overallCompletion.completed * 100)}% of grade submitted
                            </p>
                          </div>
                          <ul className="flex max-w-28 flex-wrap justify-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {modules.data
                              .filter((m) => m.assignment_progress.total > 0)
                              .map((m) => (
                                <li key={m.id} className="flex items-center gap-1">
                                  <span
                                    className="size-1.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: m.color }}
                                    aria-hidden
                                  />
                                  <span className="text-foreground">{m.name}</span>
                                  <span>{Math.round(m.completion_progress.achieved_fraction * 100)}%</span>
                                </li>
                              ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="flex-1">
              <CardHeader>
                <CardTitle>Notepad</CardTitle>
              </CardHeader>
              <CardContent>
                <QuickNotepad />
              </CardContent>
            </Card>
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-lg font-medium">Modules</h2>
          {modules.loading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          )}
          {modules.error && <p className="text-sm text-destructive">Couldn't load modules.</p>}
          {modules.data && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {modules.data.map((m) => (
                <ModuleCard key={m.id} module={m} maxCredits={maxCredits} />
              ))}
              {hasCreditRoom && (
                <AddModuleDialog onCreated={modules.refetch} trigger={<AddModuleTile />} />
              )}
            </div>
          )}
        </section>
      </div>

      {appSettings.data && (
        <AppSettingsDialog
          settings={appSettings.data}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onChanged={appSettings.refetch}
          onCalendarChanged={calendar.refetch}
        />
      )}
    </div>
  )
}
