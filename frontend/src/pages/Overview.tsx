import { useMemo, useState } from 'react'

import { AddModuleDialog } from '@/components/AddModuleDialog'
import { AssignmentItem } from '@/components/AssignmentItem'
import { CalendarAgenda } from '@/components/CalendarAgenda'
import { ModuleCard } from '@/components/ModuleCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getCalendar, listModules, listUpcomingAssignments } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

const CALENDAR_WINDOW_DAYS = 14

export function Overview() {
  const [reloadKey, setReloadKey] = useState(0)

  const range = useMemo(() => {
    const start = new Date()
    const end = new Date(start)
    end.setDate(end.getDate() + CALENDAR_WINDOW_DAYS)
    return { start, end }
  }, [])

  const modules = useAsync(() => listModules(), [reloadKey])
  const assignments = useAsync(() => listUpcomingAssignments(6), [])
  const calendar = useAsync(() => getCalendar(range.start, range.end), [range])

  const moduleName = (id: number) => modules.data?.find((m) => m.id === id)?.name ?? 'Unknown module'

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
          <CardContent>
            {calendar.loading && <Skeleton className="h-40 w-full" />}
            {calendar.error && <p className="text-sm text-destructive">Couldn't load the calendar.</p>}
            {calendar.data && <CalendarAgenda events={calendar.data} />}
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
