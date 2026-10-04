import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { motion } from 'motion/react'

import { AddModuleDialog } from '@/components/AddModuleDialog'
import { AddModuleTile } from '@/components/AddModuleTile'
import { AssignmentItem } from '@/components/AssignmentItem'
import { useOverview } from '@/components/dashboard/overviewContext'
import { LoadSwap } from '@/components/LoadSwap'
import { ModuleCard } from '@/components/ModuleCard'
import { QuickTodoList } from '@/components/QuickTodoList'
import { StudySession } from '@/components/StudySession'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { listDueFlashcards, listRevisionSessions, listUpcomingAssignments, updateRevisionSession } from '@/lib/api'
import { enter, fadeUp, stagger } from '@/lib/motion'
import { revisionSessionUrl } from '@/lib/revision'
import { useAsync } from '@/lib/useAsync'

/** Enough to fill a tall widget; it scrolls past that. */
const UPCOMING_LIMIT = 20

export function UpcomingWidget() {
  const { moduleName } = useOverview()
  const assignments = useAsync(() => listUpcomingAssignments(UPCOMING_LIMIT), [])

  return (
    <>
      {assignments.error && <p className="text-sm text-destructive">Couldn't load assignments.</p>}
      <LoadSwap loading={assignments.loading} skeleton={<Skeleton className="h-40 w-full" />}>
        {assignments.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">{"Nothing due — you're all caught up."}</p>
        )}
        {assignments.data && assignments.data.length > 0 && (
          <motion.div className="space-y-1" variants={stagger(0.04)} {...enter}>
            {assignments.data.map((a) => (
              <motion.div key={a.id} variants={fadeUp}>
                <AssignmentItem assignment={a} moduleName={moduleName(a.module_id)} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </LoadSwap>
    </>
  )
}

/** General to-dos, and each module's own under its name, with a filter. */
export function TodoWidget() {
  const { modules } = useOverview()
  return <QuickTodoList modules={modules.data ?? []} />
}

/** Module cards in as many columns as the widget's width allows, so a narrow widget is a column. */
export function ModulesWidget() {
  const { modules, appSettings } = useOverview()
  const maxCredits = appSettings?.max_credits ?? null
  const usedCredits = (modules.data ?? []).reduce((sum, m) => sum + (m.credits ?? 0), 0)
  const hasCreditRoom = maxCredits === null || usedCredits < maxCredits
  const columns = 'grid gap-3 @md:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4 @6xl:grid-cols-5'

  return (
    <>
      {modules.error && <p className="text-sm text-destructive">Couldn't load modules.</p>}
      <LoadSwap
        loading={modules.loading}
        skeleton={
          <div className={columns}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        }
      >
        {modules.data && (
          // p-0.5 keeps the hover lift and focus rings from being clipped by the scrolling body.
          <motion.div className={`${columns} p-0.5`} variants={stagger()} {...enter}>
            {modules.data.map((m) => (
              <motion.div key={m.id} variants={fadeUp} whileHover={{ y: -2 }}>
                <ModuleCard module={m} maxCredits={maxCredits} />
              </motion.div>
            ))}
            {hasCreditRoom && (
              <motion.div variants={fadeUp} whileHover={{ y: -2 }}>
                <AddModuleDialog onCreated={modules.refetch} trigger={<AddModuleTile />} />
              </motion.div>
            )}
          </motion.div>
        )}
      </LoadSwap>
    </>
  )
}

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function RevisionTodayWidget() {
  const { moduleColor, moduleName, calendar } = useOverview()
  const sessions = useAsync(() => {
    const start = startOfToday()
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
    return listRevisionSessions({ start, end })
  }, [])

  async function setDone(id: number, done: boolean) {
    await updateRevisionSession(id, { done })
    // The calendar shows the same sessions' done state.
    await Promise.all([sessions.refetch(), calendar.calendar.refetch()])
  }

  return (
    <>
      {sessions.error && <p className="text-sm text-destructive">Couldn't load revision sessions.</p>}
      <LoadSwap loading={sessions.loading} skeleton={<Skeleton className="h-24 w-full" />}>
        {sessions.data?.length === 0 && <p className="text-sm text-muted-foreground">No revision planned today.</p>}
        {sessions.data && sessions.data.length > 0 && (
          <ul className="divide-y">
            {sessions.data.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-1.5 text-sm">
                <Checkbox
                  checked={s.done}
                  onCheckedChange={(checked) => setDone(s.id, checked === true)}
                  aria-label={`Mark ${s.exam_title} revision done`}
                />
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: moduleColor(s.module_id) }} aria-hidden />
                <Link
                  to={revisionSessionUrl(s)}
                  className={`min-w-0 flex-1 truncate hover:underline ${s.done ? 'text-muted-foreground line-through' : ''}`}
                >
                  {s.exam_title}
                  <span className="text-muted-foreground"> · {moduleName(s.module_id)}</span>
                </Link>
                <span className="shrink-0 text-muted-foreground">
                  {new Date(s.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </LoadSwap>
    </>
  )
}

export function FlashcardsDueWidget() {
  const { modules, moduleColor, moduleName } = useOverview()
  const due = useAsync(() => listDueFlashcards({}), [])

  // Due counts per module, in the modules list's order.
  const rows = useMemo(() => {
    const counts = new Map<number, number>()
    for (const card of due.data ?? []) counts.set(card.module_id, (counts.get(card.module_id) ?? 0) + 1)
    const order = (modules.data ?? []).map((m) => m.id)
    return [...counts.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
  }, [due.data, modules.data])

  return (
    <>
      {due.error && <p className="text-sm text-destructive">Couldn't load flashcards.</p>}
      <LoadSwap loading={due.loading} skeleton={<Skeleton className="h-24 w-full" />}>
        {due.data?.length === 0 && <p className="text-sm text-muted-foreground">No cards due.</p>}
        {rows.length > 0 && (
          <ul className="divide-y">
            {rows.map(([moduleId, count]) => (
              <li key={moduleId} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: moduleColor(moduleId) }} aria-hidden />
                <Link to={`/modules/${moduleId}`} className="min-w-0 flex-1 truncate hover:underline">
                  {moduleName(moduleId)}
                </Link>
                <span className="shrink-0 text-muted-foreground tabular-nums">{count} due</span>
                <StudySession scope={{ moduleId }} title={moduleName(moduleId)} color={moduleColor(moduleId)} onFinished={due.refetch} />
              </li>
            ))}
          </ul>
        )}
      </LoadSwap>
    </>
  )
}
