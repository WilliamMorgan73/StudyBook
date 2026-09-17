import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { AddAssignmentDialog } from '@/components/AddAssignmentDialog'
import { AddSubmoduleDialog } from '@/components/AddSubmoduleDialog'
import { CalendarAgenda } from '@/components/CalendarAgenda'
import { NextLectureCountdown } from '@/components/NextLectureCountdown'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ASSIGNMENT_STATUS_LABEL,
  getCalendar,
  getModule,
  type Assignment,
  type Lecture,
  type Submodule,
} from '@/lib/api'
import { groupLectures, type LectureSeries } from '@/lib/lectureSchedule'
import { useAsync } from '@/lib/useAsync'

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function AssignmentRow({ moduleId, assignment }: { moduleId: number; assignment: Assignment }) {
  const overdue =
    assignment.status !== 'graded' && assignment.due_at !== null && new Date(assignment.due_at) < new Date()

  return (
    <li className="py-2">
      <Link
        to={`/modules/${moduleId}/assignments/${assignment.id}`}
        className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-muted"
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{assignment.title}</p>
          <p className="text-sm text-muted-foreground">
            {assignment.due_at ? `Due ${formatDate(assignment.due_at)}` : 'No due date'} &middot; {assignment.weight_percent}% of grade
          </p>
        </div>
        <Badge variant={overdue ? 'destructive' : assignment.status === 'graded' ? 'secondary' : 'outline'}>
          {overdue ? 'Overdue' : ASSIGNMENT_STATUS_LABEL[assignment.status]}
        </Badge>
      </Link>
    </li>
  )
}

function LectureRow({ lecture }: { lecture: Lecture }) {
  return (
    <li className="py-2">
      <p className="font-medium">{lecture.title}</p>
      <p className="text-sm text-muted-foreground">
        {formatDateTime(lecture.scheduled_at)}
        {lecture.location && ` — ${lecture.location}`}
      </p>
    </li>
  )
}

function LectureSeriesRow({ series }: { series: LectureSeries }) {
  const cadence = series.intervalDays === 7 ? `Every ${series.weekday}` : `Every other ${series.weekday}`

  return (
    <li className="py-2">
      <p className="font-medium">{series.title}</p>
      <p className="text-sm text-muted-foreground">
        {cadence} at {series.time}, until {formatDate(series.lastDate)}
        {series.location && ` — ${series.location}`} &middot; {series.lectures.length} lectures
      </p>
    </li>
  )
}

function SubmoduleRow({ moduleId, submodule }: { moduleId: number; submodule: Submodule }) {
  return (
    <li className="py-2">
      <Link to={`/modules/${moduleId}/submodules/${submodule.id}`} className="block hover:underline">
        <p className="font-medium">{submodule.title}</p>
      </Link>
      <p className="text-sm text-muted-foreground">
        {submodule.attachments.length > 0 && `${submodule.attachments.length} file${submodule.attachments.length === 1 ? '' : 's'} · `}
        Updated {formatDate(submodule.updated_at)}
      </p>
    </li>
  )
}

export function ModulePage() {
  const { moduleId } = useParams()
  const id = Number(moduleId)
  const [reloadKey, setReloadKey] = useState(0)
  const [scheduleDays, setScheduleDays] = useState(7)
  const { data: module, loading, error } = useAsync(() => getModule(id), [id, reloadKey])
  const refetch = () => setReloadKey((k) => k + 1)

  const scheduleRange = useMemo(() => {
    const start = new Date()
    const end = new Date(start)
    end.setDate(end.getDate() + scheduleDays)
    return { start, end }
  }, [scheduleDays])
  const schedule = useAsync(() => getCalendar(scheduleRange.start, scheduleRange.end), [scheduleRange])
  const moduleSchedule = (schedule.data ?? []).filter((e) => e.module_id === id)

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error || !module) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-8">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Overview
        </Link>
        <p className="text-sm text-destructive">This module couldn't be found.</p>
      </div>
    )
  }

  const dueFlashcards = module.flashcards.filter((f) => new Date(f.due_at) <= new Date()).length
  const lectureGroups = groupLectures(module.lectures)
  const sortedAssignments = [...module.assignments].sort((a, b) => {
    if (!a.due_at) return 1
    if (!b.due_at) return -1
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
  })

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Overview
        </Link>
        <Link to={`/modules/${module.id}/settings`} className="text-sm text-muted-foreground hover:text-foreground">
          Settings
        </Link>
      </div>

      <div className="flex gap-4 border-l-4 pl-4" style={{ borderColor: module.color }}>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{module.name}</h1>
          {(module.code || module.term || module.credits !== null) && (
            <p className="text-sm text-muted-foreground">
              {[module.code, module.term, module.credits !== null ? `${module.credits} credits` : null]
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {module.current_grade !== null ? `${module.current_grade.toFixed(1)}%` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">Current grade</p>
          </div>
          <div>
            <NextLectureCountdown target={module.next_lecture_at} />
            <p className="text-xs text-muted-foreground">
              Next lecture{module.next_lecture_at && ` · ${formatDate(module.next_lecture_at)}`}
            </p>
          </div>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Schedule</h2>
          <Tabs value={String(scheduleDays)} onValueChange={(v) => setScheduleDays(Number(v))}>
            <TabsList>
              <TabsTrigger value="7">Week</TabsTrigger>
              <TabsTrigger value="14">Fortnight</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {schedule.loading && <Skeleton className="h-32 w-full" />}
        {schedule.data && <CalendarAgenda events={moduleSchedule} />}
      </section>

      <div className="grid gap-8 sm:grid-cols-2">
        <section>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-medium">Assignments</h2>
            <AddAssignmentDialog moduleId={module.id} onCreated={refetch} />
          </div>
          {sortedAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments yet.</p>
          ) : (
            <ul className="divide-y">
              {sortedAssignments.map((a) => (
                <AssignmentRow key={a.id} moduleId={module.id} assignment={a} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-medium">Lectures</h2>
            <Link to={`/modules/${module.id}/settings`} className="text-sm text-muted-foreground hover:text-foreground">
              Manage
            </Link>
          </div>
          {lectureGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lectures scheduled.</p>
          ) : (
            <ul className="divide-y">
              {lectureGroups.map((group) =>
                group.type === 'series' ? (
                  <LectureSeriesRow key={`${group.series.title}-${group.series.firstDate}`} series={group.series} />
                ) : (
                  <LectureRow key={group.lecture.id} lecture={group.lecture} />
                ),
              )}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-medium">Submodules</h2>
            <AddSubmoduleDialog moduleId={module.id} onCreated={refetch} />
          </div>
          {module.submodules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submodules yet.</p>
          ) : (
            <ul className="divide-y">
              {module.submodules.map((s) => (
                <SubmoduleRow key={s.id} moduleId={module.id} submodule={s} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-1 text-lg font-medium">Flashcards</h2>
          {module.flashcards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No flashcards yet.</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {module.flashcards.length} card{module.flashcards.length === 1 ? '' : 's'}
              {dueFlashcards > 0 && `, ${dueFlashcards} due for review`}
            </p>
          )}
        </section>
      </div>

      {module.related_modules.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-medium">Related modules</h2>
          <div className="flex flex-wrap gap-2">
            {module.related_modules.map((related) => (
              <Link key={related.id} to={`/modules/${related.id}`}>
                <Badge variant="outline">{related.name}</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
