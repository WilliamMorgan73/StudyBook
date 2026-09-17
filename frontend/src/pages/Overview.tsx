import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Settings } from 'lucide-react'

import { AddModuleDialog } from '@/components/AddModuleDialog'
import { AddModuleTile } from '@/components/AddModuleTile'
import { AppSettingsDialog } from '@/components/AppSettingsDialog'
import { AssignmentItem } from '@/components/AssignmentItem'
import { calendarGridRange, MonthCalendar } from '@/components/MonthCalendar'
import { ModuleCard } from '@/components/ModuleCard'
import { PageHeader } from '@/components/PageHeader'
import { QuickNotepad } from '@/components/QuickNotepad'
import { QuickTodoList } from '@/components/QuickTodoList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getAppSettings, getCalendar, listModules, listUpcomingAssignments } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function Overview() {
  const [reloadKey, setReloadKey] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selected, setSelected] = useState(() => new Date())
  const [expandedEventKey, setExpandedEventKey] = useState<string | null>(null)

  const gridRange = useMemo(() => calendarGridRange(month), [month])

  const modules = useAsync(() => listModules(), [reloadKey])
  const assignments = useAsync(() => listUpcomingAssignments(6), [])
  const calendar = useAsync(() => getCalendar(gridRange.start, gridRange.end), [gridRange])
  const appSettings = useAsync(() => getAppSettings(), [reloadKey])

  const maxCredits = appSettings.data?.max_credits ?? null
  const usedCredits = (modules.data ?? []).reduce((sum, m) => sum + (m.credits ?? 0), 0)
  const hasCreditRoom = maxCredits === null || usedCredits < maxCredits

  const moduleName = (id: number) => modules.data?.find((m) => m.id === id)?.name ?? 'Unknown module'
  const moduleColor = (id: number) => modules.data?.find((m) => m.id === id)?.color ?? 'var(--muted-foreground)'

  const events = useMemo(() => calendar.data ?? [], [calendar.data])
  const selectedDayEvents = useMemo(
    () => events.filter((e) => isSameDay(new Date(e.starts_at), selected)),
    [events, selected],
  )

  const averageGrade = useMemo(() => {
    const grades = (modules.data ?? [])
      .map((m) => m.current_grade)
      .filter((g): g is number => g !== null)
    if (grades.length === 0) return null
    return grades.reduce((sum, g) => sum + g, 0) / grades.length
  }, [modules.data])

  return (
    <div className="min-h-full">
      <PageHeader
        left={
          <div>
            <h1 className="text-2xl font-semibold">Overview</h1>
            <p className="text-sm text-muted-foreground">
              {modules.data?.length ?? 0} modules
              {averageGrade !== null && `, ${averageGrade.toFixed(1)}% average grade`}
            </p>
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
            <CardContent className="space-y-4">
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
                      <span className="size-1.5 rounded-full bg-current" aria-hidden />
                      Lecture
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rotate-45 rounded-[1px] bg-current" aria-hidden />
                      Assignment due
                    </span>
                  </div>
                  <div className="border-t pt-3">
                    <p className="mb-2 text-sm font-medium">
                      {selected.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                    {selectedDayEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nothing scheduled this day.</p>
                    ) : (
                      <ul className="space-y-1">
                        {selectedDayEvents.map((event) => {
                          const isExpanded = expandedEventKey === `${event.kind}-${event.id}`
                          return (
                            <li key={`${event.kind}-${event.id}`}>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedEventKey(isExpanded ? null : `${event.kind}-${event.id}`)
                                }
                                className="-mx-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                              >
                                <span
                                  className={`size-1.5 shrink-0 ${
                                    event.kind === 'lecture' ? 'rounded-full' : 'rotate-45 rounded-[1px]'
                                  }`}
                                  style={{ backgroundColor: moduleColor(event.module_id) }}
                                  aria-hidden
                                />
                                <span className="truncate">{event.title}</span>
                                <span className="text-muted-foreground">{moduleName(event.module_id)}</span>
                                <span className="ml-auto shrink-0 text-muted-foreground">
                                  {event.kind === 'assignment_due'
                                    ? 'Due'
                                    : new Date(event.starts_at).toLocaleTimeString(undefined, {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}
                                </span>
                              </button>
                              {isExpanded && event.kind === 'lecture' && (
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
                                  <Link to={event.url} className="inline-block text-foreground hover:underline">
                                    Open module &rarr;
                                  </Link>
                                </div>
                              )}
                              {isExpanded && event.kind === 'assignment_due' && (
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
                </>
              )}
            </CardContent>
          </Card>

          <Card>
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

          <div className="flex flex-col gap-6">
            <Card className="flex-1">
              <CardHeader>
                <CardTitle>To-do</CardTitle>
              </CardHeader>
              <CardContent>
                <QuickTodoList />
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
                <AddModuleDialog onCreated={() => setReloadKey((k) => k + 1)} trigger={<AddModuleTile />} />
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
          onChanged={() => {
            setSettingsOpen(false)
            setReloadKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}
