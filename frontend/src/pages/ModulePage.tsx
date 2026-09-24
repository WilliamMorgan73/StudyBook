import { Settings, ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { AddAssignmentDialog } from '@/components/AddAssignmentDialog'
import { AddSubmoduleDialog } from '@/components/AddSubmoduleDialog'
import { Countdown } from '@/components/Countdown'
import { ModuleProgressRing } from '@/components/ModuleProgressRing'
import { ModuleSettingsDialog } from '@/components/ModuleSettingsDialog'
import { ModuleWeekCalendar } from '@/components/ModuleWeekCalendar'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ASSIGNMENT_STATUS_LABEL, getModule, type Assignment, type Submodule } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

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
            {assignment.due_at ? `Due ${formatDate(assignment.due_at)}` : 'No due date'} &middot;{' '}
            {assignment.weight_percent}% of grade
          </p>
        </div>
        <Badge variant={overdue ? 'destructive' : assignment.status === 'graded' ? 'secondary' : 'outline'}>
          {overdue ? 'Overdue' : ASSIGNMENT_STATUS_LABEL[assignment.status]}
        </Badge>
      </Link>
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
        {submodule.attachments.length > 0 &&
          `${submodule.attachments.length} file${submodule.attachments.length === 1 ? '' : 's'} · `}
        Updated {formatDate(submodule.updated_at)}
      </p>
    </li>
  )
}

export function ModulePage() {
  const { moduleId } = useParams()
  const id = Number(moduleId)
  const [reloadKey, setReloadKey] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { data: module, loading, error } = useAsync(() => getModule(id), [id, reloadKey])
  const refetch = () => setReloadKey((k) => k + 1)

  if (loading) {
    return (
      <div className="space-y-4 px-8 py-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error || !module) {
    return (
      <div className="space-y-4 px-8 py-8">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Overview
        </Link>
        <p className="text-sm text-destructive">This module couldn't be found.</p>
      </div>
    )
  }

  const dueFlashcards = module.flashcards.filter((f) => new Date(f.due_at) <= new Date()).length
  const sortedAssignments = [...module.assignments].sort((a, b) => {
    if (!a.due_at) return 1
    if (!b.due_at) return -1
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
  })

  return (
    <div className="min-h-full">
      <PageHeader
        left={
          <Link to="/" className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4 shrink-0" />
            <span className="truncate">Overview</span>
          </Link>
        }
        right={
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings /> Settings
          </Button>
        }
      />

      <div className="border-b" style={{ backgroundColor: `${module.color}1f` }}>
        <div className="flex items-center gap-6 px-8 py-12">
          <ModuleProgressRing progress={module.completion_progress} color={module.color} size={100} strokeWidth={10} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-4xl font-semibold">{module.name}</h1>
            {(module.code || module.term || module.credits !== null) && (
              <p className="mt-1 text-base text-muted-foreground">
                {[module.code, module.term, module.credits !== null ? `${module.credits} credits` : null]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-8 text-right">
            <div>
              <p className="text-4xl font-semibold tabular-nums">
                {module.current_grade !== null ? `${module.current_grade.toFixed(1)}%` : '—'}
              </p>
              <p className="text-sm text-muted-foreground">Current grade</p>
            </div>
            <div>
              <Countdown target={module.next_lecture_at} />
              <p className="mt-0.5 text-sm text-muted-foreground">
                Next lecture{module.next_lecture_at && ` · ${formatDate(module.next_lecture_at)}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-8 px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <ModuleWeekCalendar lectures={module.lectures} color={module.color} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Submodules</CardTitle>
                <AddSubmoduleDialog moduleId={module.id} onCreated={refetch} />
              </div>
            </CardHeader>
            <CardContent>
              {module.submodules.length === 0 ? (
                <p className="text-sm text-muted-foreground">No submodules yet.</p>
              ) : (
                <ul className="divide-y">
                  {module.submodules.map((s) => (
                    <SubmoduleRow key={s.id} moduleId={module.id} submodule={s} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Assignments</CardTitle>
                <AddAssignmentDialog moduleId={module.id} onCreated={refetch} />
              </div>
            </CardHeader>
            <CardContent>
              {sortedAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No assignments yet.</p>
              ) : (
                <ul className="divide-y">
                  {sortedAssignments.map((a) => (
                    <AssignmentRow key={a.id} moduleId={module.id} assignment={a} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Flashcards</CardTitle>
            </CardHeader>
            <CardContent>
              {module.flashcards.length === 0 ? (
                <p className="text-sm text-muted-foreground">No flashcards yet.</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {module.flashcards.length} card{module.flashcards.length === 1 ? '' : 's'}
                  {dueFlashcards > 0 && `, ${dueFlashcards} due for review`}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {module.related_modules.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Related modules</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {module.related_modules.map((related) => (
                  <Link key={related.id} to={`/modules/${related.id}`}>
                    <Badge variant="outline">{related.name}</Badge>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <ModuleSettingsDialog
        module={module}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onChanged={() => {
          setSettingsOpen(false)
          refetch()
        }}
      />
    </div>
  )
}
