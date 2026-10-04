import { Link } from 'react-router-dom'

import { AddAssignmentDialog } from '@/components/AddAssignmentDialog'
import { AddSubmoduleDialog } from '@/components/AddSubmoduleDialog'
import { useModuleData } from '@/components/dashboard/moduleContext'
import { LoadSwap } from '@/components/LoadSwap'
import { ModuleProgressRing } from '@/components/ModuleProgressRing'
import { ModuleWeekCalendar } from '@/components/ModuleWeekCalendar'
import { AnimatedNumber } from '@/components/RadialProgress'
import { StudySession } from '@/components/StudySession'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { ASSIGNMENT_STATUS_LABEL, type Assignment, type Submodule } from '@/lib/api'
import { revisionSessionUrl } from '@/lib/revision'
import { useElementSize } from '@/lib/useElementSize'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ScheduleWidget() {
  const { module, weekSessions, setRevisionDone } = useModuleData()
  return (
    <ModuleWeekCalendar
      lectures={module.lectures}
      exams={module.assignments.filter((a) => a.kind === 'exam')}
      revisionSessions={weekSessions.data ?? []}
      onRevisionDone={setRevisionDone}
      color={module.color}
    />
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

export function SubmodulesAction() {
  const { module, refetch } = useModuleData()
  return <AddSubmoduleDialog moduleId={module.id} onCreated={refetch} />
}

export function SubmodulesWidget() {
  const { module } = useModuleData()
  if (module.submodules.length === 0) return <p className="text-sm text-muted-foreground">No submodules yet.</p>
  return (
    <ul className="divide-y">
      {module.submodules.map((s) => (
        <SubmoduleRow key={s.id} moduleId={module.id} submodule={s} />
      ))}
    </ul>
  )
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
            {assignment.due_at
              ? `${assignment.kind === 'exam' ? 'Exam' : 'Due'} ${formatDate(assignment.due_at)}`
              : 'No due date'}{' '}
            &middot;{' '}
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

export function AssignmentsAction() {
  const { module, refetch } = useModuleData()
  return <AddAssignmentDialog moduleId={module.id} submodules={module.submodules} onCreated={refetch} />
}

export function AssignmentsWidget() {
  const { module } = useModuleData()
  if (module.assignments.length === 0) return <p className="text-sm text-muted-foreground">No assignments yet.</p>
  // By due date, undated last.
  const sorted = [...module.assignments].sort((a, b) => {
    if (!a.due_at) return 1
    if (!b.due_at) return -1
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime()
  })
  return (
    <ul className="divide-y">
      {sorted.map((a) => (
        <AssignmentRow key={a.id} moduleId={module.id} assignment={a} />
      ))}
    </ul>
  )
}

export function FlashcardsAction() {
  const { module, refetch } = useModuleData()
  return <StudySession scope={{ moduleId: module.id }} title={module.name} onFinished={refetch} />
}

export function FlashcardsWidget() {
  const { module } = useModuleData()
  if (module.flashcards.length === 0) return <p className="text-sm text-muted-foreground">No flashcards yet.</p>
  const due = module.flashcards.filter((f) => new Date(f.due_at) <= new Date()).length
  return (
    <p className="text-sm text-muted-foreground">
      {module.flashcards.length} card{module.flashcards.length === 1 ? '' : 's'}
      {due > 0 && `, ${due} due for review`}
    </p>
  )
}

export function RevisionWidget() {
  const { module, upcomingSessions, setRevisionDone } = useModuleData()
  return (
    <>
      {upcomingSessions.error && <p className="text-sm text-destructive">Couldn't load revision sessions.</p>}
      <LoadSwap loading={upcomingSessions.loading} skeleton={<Skeleton className="h-24 w-full" />}>
        {upcomingSessions.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No revision planned for the next two weeks.</p>
        )}
        {upcomingSessions.data && upcomingSessions.data.length > 0 && (
          <ul className="divide-y">
            {upcomingSessions.data.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-1.5 text-sm">
                <Checkbox
                  checked={s.done}
                  onCheckedChange={(checked) => setRevisionDone(s, checked === true)}
                  aria-label={`Mark ${s.exam_title} revision done`}
                />
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: module.color }} aria-hidden />
                <Link
                  to={revisionSessionUrl(s)}
                  className={`min-w-0 flex-1 truncate hover:underline ${s.done ? 'text-muted-foreground line-through' : ''}`}
                >
                  {s.exam_title}
                </Link>
                <span className="shrink-0 text-muted-foreground">
                  {new Date(s.starts_at).toLocaleString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </LoadSwap>
    </>
  )
}

/** The ring grows with the widget, between these sizes (px). */
const RING_MIN = 96
const RING_MAX = 280
/** Room under the ring for its caption (px). */
const CAPTION_ROOM = 48

export function ModuleProgressWidget() {
  const { module } = useModuleData()
  const [sizeRef, size] = useElementSize<HTMLDivElement>()
  const ringSize = Math.round(Math.min(RING_MAX, Math.max(RING_MIN, Math.min(size.width, size.height - CAPTION_ROOM))))
  const { achieved_fraction, completed_fraction } = module.completion_progress

  return (
    <div ref={sizeRef} className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
      <div className="relative flex items-center justify-center">
        <ModuleProgressRing
          progress={module.completion_progress}
          color={module.color}
          size={ringSize}
          strokeWidth={Math.round(ringSize / 11)}
        />
        <p className="absolute font-semibold tabular-nums" style={{ fontSize: `${ringSize / 110}rem` }}>
          <AnimatedNumber value={Math.round(achieved_fraction * 100)} />%
        </p>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        achieved · {Math.round(completed_fraction * 100)}% submitted
        {module.current_grade !== null && ` · ${module.current_grade.toFixed(1)}% current grade`}
      </p>
    </div>
  )
}

export function RelatedModulesWidget() {
  const { module } = useModuleData()
  if (module.related_modules.length === 0) {
    return <p className="text-sm text-muted-foreground">No related modules.</p>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {module.related_modules.map((related) => (
        <Link key={related.id} to={`/modules/${related.id}`}>
          <Badge variant="outline">{related.name}</Badge>
        </Link>
      ))}
    </div>
  )
}
