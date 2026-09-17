import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AddModuleDialog } from '@/components/AddModuleDialog'
import { AssignmentItem } from '@/components/AssignmentItem'
import { calendarGridRange, MonthCalendar } from '@/components/MonthCalendar'
import { ModuleCard } from '@/components/ModuleCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getCalendar, listModules, listUpcomingAssignments } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function Overview() {
  const [reloadKey, setReloadKey] = useState(0)
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selected, setSelected] = useState(() => new Date())

  const gridRange = useMemo(() => calendarGridRange(month), [month])

  const modules = useAsync(() => listModules(), [reloadKey])
  const assignments = useAsync(() => listUpcomingAssignments(6), [])
  const calendar = useAsync(() => getCalendar(gridRange.start, gridRange.end), [gridRange])

  const moduleName = (id: number) => modules.data?.find((m) => m.id === id)?.name ?? 'Unknown module'
  const moduleColor = (id: number) => modules.data?.find((m) => m.id === id)?.color ?? 'var(--muted-foreground)'

  const lectures = useMemo(() => (calendar.data ?? []).filter((e) => e.kind === 'lecture'), [calendar.data])
  const selectedDayLectures = useMemo(
    () => lectures.filter((e) => isSameDay(new Date(e.starts_at), selected)),
    [lectures, selected],
  )

  const averageGrade = useMemo(() => {
    const grades = (modules.data ?? [])
      .map((m) => m.current_grade)
      .filter((g): g is number => g !== null)
    if (grades.length === 0) return null
    return grades.reduce((sum, g) => sum + g, 0) / grades.length
  }, [modules.data])

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-sm text-muted-foreground">
            {modules.data?.length ?? 0} modules
            {averageGrade !== null && `, ${averageGrade.toFixed(1)}% average grade`}
          </p>
        </div>
        <AddModuleDialog onCreated={() => setReloadKey((k) => k + 1)} />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
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
                  events={lectures}
                  selected={selected}
                  onSelect={setSelected}
                  eventColor={(event) => moduleColor(event.module_id)}
                />
                <div className="border-t pt-3">
                  <p className="mb-2 text-sm font-medium">
                    {selected.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                  {selectedDayLectures.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No lectures this day.</p>
                  ) : (
                    <ul className="space-y-1">
                      {selectedDayLectures.map((event) => (
                        <li key={event.id}>
                          <Link
                            to={event.url}
                            className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                          >
                            <span
                              className="size-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: moduleColor(event.module_id) }}
                              aria-hidden
                            />
                            <span className="truncate">{event.title}</span>
                            <span className="text-muted-foreground">{moduleName(event.module_id)}</span>
                            <span className="ml-auto shrink-0 text-muted-foreground">
                              {new Date(event.starts_at).toLocaleTimeString(undefined, {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                          </Link>
                        </li>
                      ))}
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
        {modules.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Add your first module to start tracking lectures, assignments, and grades.
          </p>
        )}
        {modules.data && modules.data.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.data.map((m) => (
              <ModuleCard key={m.id} module={m} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
