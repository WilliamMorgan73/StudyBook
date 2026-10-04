import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AddAssignmentDialog } from '@/components/AddAssignmentDialog'
import { AddSubmoduleDialog } from '@/components/AddSubmoduleDialog'
import { useModuleData } from '@/components/dashboard/moduleContext'
import { Countdown } from '@/components/Countdown'
import { EventMarker } from '@/components/EventMarker'
import { LoadSwap } from '@/components/LoadSwap'
import { ModuleDayList, ModuleWeekCalendar } from '@/components/ModuleWeekCalendar'
import { NotepadArea } from '@/components/QuickNotepad'
import { QuickTodoList } from '@/components/QuickTodoList'
import { AnimatedNumber, RadialProgress } from '@/components/RadialProgress'
import { StudySession } from '@/components/StudySession'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ASSIGNMENT_STATUS_LABEL, updateModule, updateTodo, type Assignment, type Submodule } from '@/lib/api'
import { examEndsAt } from '@/lib/exam'
import { assignmentContribution, assignmentScore, targetOutlook, type TargetOutlook } from '@/lib/grades'
import { assignmentRingSegments } from '@/lib/progress'
import { revisionSessionUrl } from '@/lib/revision'
import { useElementSize } from '@/lib/useElementSize'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** The module's events, as the week calendar and the day list take them. */
function useModuleEvents() {
  const { module, weekSessions, setRevisionDone } = useModuleData()
  return {
    lectures: module.lectures,
    exams: module.assignments.filter((a) => a.kind === 'exam'),
    revisionSessions: weekSessions.data ?? [],
    onRevisionDone: setRevisionDone,
    color: module.color,
  }
}

export function ScheduleWidget() {
  const { selectedDay, setSelectedDay, dayAgendaPlaced } = useModuleData()
  return (
    <ModuleWeekCalendar
      selected={selectedDay}
      onSelect={setSelectedDay}
      showDay={!dayAgendaPlaced}
      {...useModuleEvents()}
    />
  )
}

export function DayAgendaWidget() {
  const { selectedDay } = useModuleData()
  return <ModuleDayList day={selectedDay} {...useModuleEvents()} />
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

/** The ring grows with the widget up to RING_MAX (px). Below RING_FULL there's no room for its
 * caption, and it never gets smaller than RING_FLOOR. */
const RING_FLOOR = 40
const RING_FULL = 96
const RING_MAX = 280

/**
 * The module's ring split by assignment, like the Overview's Progress split by module: hovering an
 * arc or a legend row highlights that assignment and shows its result in the middle.
 */
export function ModuleProgressWidget() {
  const { module } = useModuleData()
  const [activeId, setActiveId] = useState<number | null>(null)
  const [sizeRef, size] = useElementSize<HTMLDivElement>()

  const counted = module.assignments.filter((a) => a.status === 'submitted' || a.status === 'graded')
  const segments = useMemo(() => assignmentRingSegments(module.assignments, module.color), [module])
  const active = counted.find((a) => a.id === activeId) ?? null
  const { achieved_fraction, completed_fraction } = module.completion_progress

  // Room under the ring for the legend (a line per couple of assignments) or the "nothing yet"
  // note. When even a full-size ring wouldn't leave that room, the legend goes and the ring takes
  // the whole widget, so the widget never needs to scroll.
  const legendRoom = 12 + (counted.length === 0 ? 16 : Math.ceil(counted.length / 2) * 22)
  const showLegend = Math.min(size.width, size.height - legendRoom) >= RING_FULL
  const room = Math.min(size.width, showLegend ? size.height - legendRoom : size.height)
  const ringSize = Math.round(Math.min(RING_MAX, Math.max(RING_FLOOR, room)))
  const showCaption = ringSize >= RING_FULL
  const scale = ringSize / RING_FULL
  const activeScore = active ? assignmentScore(active) : null

  return (
    <div ref={sizeRef} className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
      <div className="relative flex items-center justify-center">
        <RadialProgress
          segments={segments}
          size={ringSize}
          strokeWidth={Math.round(9 * Math.sqrt(scale))}
          activeId={activeId}
          onActiveChange={(id) => setActiveId(id as number | null)}
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
          {/* The module's achieved %, or a hovered assignment's own score (— until it's graded). */}
          <p className="font-semibold tabular-nums" style={{ fontSize: `${1.25 * Math.sqrt(scale)}rem` }}>
            {active && activeScore === null ? (
              '—'
            ) : (
              <>
                <AnimatedNumber value={Math.round((active ? (activeScore ?? 0) : achieved_fraction) * 100)} />%
              </>
            )}
          </p>
          {showCaption && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={active?.id ?? 'module'}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.12 }}
                className="w-full text-xs"
              >
                {active ? (
                  <>
                    <p className="truncate font-medium" style={{ color: module.color }}>
                      {active.title}
                    </p>
                    <p className="text-muted-foreground">
                      {activeScore === null
                        ? `${active.weight_percent}% of grade · awaiting grade`
                        : `${(activeScore * active.weight_percent).toFixed(1)} of ${active.weight_percent}% earned`}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground">achieved</p>
                    <p className="text-muted-foreground/70">{Math.round(completed_fraction * 100)}% submitted</p>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {!showLegend ? null : counted.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing submitted yet.</p>
      ) : (
        <ul className="flex flex-wrap justify-center gap-x-1 gap-y-0.5 text-xs" onPointerLeave={() => setActiveId(null)}>
          {counted.map((a) => {
            const score = assignmentScore(a)
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onPointerEnter={() => setActiveId(a.id)}
                  onFocus={() => setActiveId(a.id)}
                  onBlur={() => setActiveId(null)}
                  className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-opacity ${
                    activeId !== null && activeId !== a.id ? 'opacity-40' : ''
                  }`}
                >
                  <span className="max-w-32 truncate">{a.title}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {score === null ? 'submitted' : `${Math.round(score * 100)}%`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Exams still to come: a countdown to the next, then the rest. */
export function ExamsWidget() {
  const { module } = useModuleData()
  const now = new Date()
  const exams = module.assignments
    .filter((a) => a.kind === 'exam' && a.due_at !== null && examEndsAtOrStart(a) > now)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())

  if (exams.length === 0) return <p className="text-sm text-muted-foreground">No exams coming up.</p>
  const [next, ...rest] = exams
  return (
    <div className="space-y-3">
      <div>
        <Link
          to={`/modules/${module.id}/assignments/${next.id}`}
          className="flex items-center gap-2 font-medium hover:underline"
        >
          <EventMarker kind="exam" color={module.color} className="shrink-0" />
          <span className="truncate">{next.title}</span>
        </Link>
        <p className="text-sm text-muted-foreground">{examDetails(next)}</p>
        <div className="mt-1">
          <Countdown target={next.due_at} />
        </div>
      </div>
      {rest.length > 0 && (
        <ul className="divide-y border-t">
          {rest.map((exam) => (
            <li key={exam.id} className="py-1.5 text-sm">
              <Link to={`/modules/${module.id}/assignments/${exam.id}`} className="block truncate font-medium hover:underline">
                {exam.title}
              </Link>
              <p className="text-muted-foreground">{examDetails(exam)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** An exam counts as upcoming until it ends (or, with no duration, until it starts). */
function examEndsAtOrStart(exam: Assignment) {
  return examEndsAt(exam.due_at!, exam.duration_minutes) ?? new Date(exam.due_at!)
}

function examDetails(exam: Assignment) {
  return [
    formatDateTime(exam.due_at!),
    exam.duration_minutes ? `${exam.duration_minutes} min` : null,
    exam.location,
    `${exam.weight_percent}% of grade`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** How many upcoming lectures the Lectures widget lists; it scrolls past what fits. */
const LECTURE_LIMIT = 20

export function LecturesWidget() {
  const { module } = useModuleData()
  const [now] = useState(() => Date.now())
  const lectures = module.lectures
    .filter((l) => new Date(l.scheduled_at).getTime() + (l.duration_minutes ?? 0) * 60_000 > now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, LECTURE_LIMIT)

  if (lectures.length === 0) return <p className="text-sm text-muted-foreground">No lectures coming up.</p>
  return (
    <ul className="divide-y">
      {lectures.map((l) => (
        <li key={l.id} className="flex items-center gap-3 py-1.5 text-sm">
          <EventMarker kind="lecture" color={module.color} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{l.title}</p>
            <p className="truncate text-muted-foreground">
              {[formatDateTime(l.scheduled_at), l.duration_minutes ? `${l.duration_minutes} min` : null, l.location]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {l.week_number !== null && <Badge variant="outline">Week {l.week_number}</Badge>}
        </li>
      ))}
    </ul>
  )
}

const TARGET_KEY = (moduleId: number) => `studybook.gradeTarget.${moduleId}`
const DEFAULT_TARGET = 70

function readTarget(moduleId: number): number {
  try {
    const stored = Number(localStorage.getItem(TARGET_KEY(moduleId)))
    return stored > 0 && stored <= 100 ? stored : DEFAULT_TARGET
  } catch {
    return DEFAULT_TARGET
  }
}

/** Each assignment's weight, score and share of the grade, and what's needed to hit a target. */
export function GradesWidget() {
  const { module } = useModuleData()
  const [target, setTarget] = useState(() => readTarget(module.id))
  const assignments = [...module.assignments].sort((a, b) => b.weight_percent - a.weight_percent)
  const totalWeight = module.assignments.reduce((sum, a) => sum + a.weight_percent, 0)
  const outlook = targetOutlook(module.assignments, target)

  function changeTarget(value: string) {
    const next = Number(value)
    if (!(next > 0 && next <= 100)) return
    setTarget(next)
    try {
      localStorage.setItem(TARGET_KEY(module.id), String(next))
    } catch {
      // Storage blocked: the target just won't be remembered.
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assignments yet.</p>
      ) : (
        // The table scrolls on its own, so the target line below it stays in view.
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-1 text-left font-normal">Assignment</th>
                <th className="pb-1 text-right font-normal">Weight</th>
                <th className="pb-1 text-right font-normal">Score</th>
                <th className="pb-1 text-right font-normal">Earned</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {assignments.map((a) => {
                const score = assignmentScore(a)
                const points = assignmentContribution(a)
                return (
                  <tr key={a.id}>
                    <td className="max-w-0 truncate py-1.5 pr-2">
                      <Link to={`/modules/${module.id}/assignments/${a.id}`} className="hover:underline">
                        {a.title}
                      </Link>
                    </td>
                    <td className="py-1.5 text-right">{a.weight_percent}%</td>
                    <td className="py-1.5 text-right">{score === null ? '—' : `${Math.round(score * 100)}%`}</td>
                    <td className="py-1.5 text-right">{points === null ? '—' : points.toFixed(1)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t text-muted-foreground tabular-nums">
              <tr>
                <td className="pt-1.5">Total</td>
                <td className={`pt-1.5 text-right ${totalWeight !== 100 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                  {totalWeight}%
                </td>
                <td />
                <td className="pt-1.5 text-right">
                  {(module.completion_progress.achieved_fraction * 100).toFixed(1)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="mt-auto flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t pt-3 text-sm">
        <label htmlFor={`grade-target-${module.id}`} className="text-muted-foreground">
          Target
        </label>
        <Input
          id={`grade-target-${module.id}`}
          type="number"
          min={1}
          max={100}
          defaultValue={target}
          onChange={(e) => changeTarget(e.target.value)}
          className="h-7 w-16 tabular-nums"
        />
        <span className="text-muted-foreground">%:</span>
        <span className="font-medium">{outlookText(outlook)}</span>
      </div>
    </div>
  )
}

function outlookText(outlook: TargetOutlook) {
  switch (outlook.kind) {
    case 'final':
      return `Finished on ${outlook.achieved.toFixed(1)}%`
    case 'secured':
      return 'Already secured'
    case 'needs':
      return `Needs ${Math.ceil(outlook.needed)}% across the other ${outlook.remainingWeight}% of the grade`
    case 'unreachable':
      return `Out of reach (would need ${Math.ceil(outlook.needed)}%)`
  }
}

/** Unticked checklist items from every assignment in the module, by assignment. */
export function OpenTodosWidget() {
  const { module, refetch } = useModuleData()
  const groups = module.assignments
    .map((a) => ({ assignment: a, todos: a.todos.filter((t) => !t.done) }))
    .filter((g) => g.todos.length > 0)

  if (groups.length === 0) return <p className="text-sm text-muted-foreground">No open to-dos on assignments.</p>
  return (
    <div className="space-y-3">
      {groups.map(({ assignment, todos }) => (
        <section key={assignment.id}>
          <Link
            to={`/modules/${module.id}/assignments/${assignment.id}`}
            className="block truncate text-xs font-medium text-muted-foreground hover:underline"
          >
            {assignment.title}
          </Link>
          <ul>
            {todos.map((todo) => (
              <li key={todo.id} className="flex items-center gap-2 py-1 text-sm">
                <Checkbox
                  checked={todo.done}
                  aria-label={`Mark "${todo.text}" done`}
                  onCheckedChange={async (checked) => {
                    await updateTodo(assignment.id, todo.id, { done: checked === true })
                    await refetch()
                  }}
                />
                <span className="min-w-0 flex-1">{todo.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** The module's own to-do list; the Overview's To-do widget shows it under the module's name. */
export function ModuleTodoWidget() {
  const { module } = useModuleData()
  return <QuickTodoList moduleId={module.id} />
}

export function ModuleNotepadWidget() {
  const { module, refetch } = useModuleData()
  return (
    <NotepadArea
      value={module.notes ?? ''}
      onSave={async (notes) => {
        await updateModule(module.id, { notes })
        await refetch()
      }}
    />
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
