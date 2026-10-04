import { CalendarPlus, ChevronRight, RefreshCw, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { PlanRevisionDialog } from '@/components/PlanRevisionDialog'
import { RevisionSessionDialog } from '@/components/RevisionSessionDialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { WidgetError } from '@/components/WidgetError'
import {
  deleteRevisionPlan,
  getRevisionPlanStatus,
  listRevisionSessions,
  updateRevisionSession,
  type Assignment,
} from '@/lib/api'
import { findUpcomingSessionIndex, formatSessionWhen, replanForm, replanReasons } from '@/lib/revision'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

const COLLAPSED_KEY = 'studybook.revisionPlan.collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * An exam's revision plan on its Assignment page: "Plan revision" until there is one, then its sessions
 * with done ticks, Replan, and a nudge to replan when sessions were missed or weak topics shifted.
 * Collapsible (remembered across exams), with capped height and inner scrolling to the next upcoming session.
 * `?session=<id>` opens that session's view, which is how calendars link to a session.
 */
export function RevisionPlan({ exam, color }: { exam: Assignment; color?: string }) {
  const sessions = useAsync(() => listRevisionSessions({ assignmentId: exam.id }), [exam.id])
  const status = useAsync(() => getRevisionPlanStatus(exam.id), [exam.id])
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [planOpen, setPlanOpen] = useState(false)
  const [replanOpen, setReplanOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  const listRef = useRef<HTMLUListElement>(null)
  const upcomingRef = useRef<HTMLLIElement>(null)

  const requestedSessionId = Number(searchParams.get('session')) || null
  // Kept after the param is cleared, so the dialog's content stays put while it animates closed.
  const [shownSessionId, setShownSessionId] = useState(requestedSessionId)
  if (requestedSessionId !== null && requestedSessionId !== shownSessionId) setShownSessionId(requestedSessionId)

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next))
    } catch {
      // Storage unavailable: toggle still works for this visit.
    }
  }

  function openSession(id: number | null) {
    setSearchParams(
      (params) => {
        if (id === null) params.delete('session')
        else params.set('session', String(id))
        return params
      },
      { replace: true },
    )
  }

  // Ticks and replans change the replan signal too.
  async function refetch() {
    await Promise.all([sessions.refetch(), status.refetch()])
  }

  async function setDone(id: number, done: boolean) {
    await updateRevisionSession(id, { done })
    await refetch()
  }

  async function clearPlan() {
    if (!confirm('Delete every session in this revision plan, including ones ticked done?')) return
    await deleteRevisionPlan(exam.id)
    await refetch()
  }

  const hasSessions = Boolean(sessions.data && sessions.data.length > 0)

  // Incomplete sessions at top in chronological order; completed sessions sink to the bottom in chronological order.
  const sortedSessions = useMemo(() => {
    if (!sessions.data) return []
    const incomplete = sessions.data.filter((s) => !s.done)
    const completed = sessions.data.filter((s) => s.done)
    return [...incomplete, ...completed]
  }, [sessions.data])

  const upcomingIndex = findUpcomingSessionIndex(sortedSessions)

  useEffect(() => {
    if (!collapsed && upcomingRef.current && listRef.current) {
      listRef.current.scrollTop = upcomingRef.current.offsetTop
    }
  }, [collapsed, sessions.data])

  const examPassed = exam.due_at !== null && new Date(exam.due_at) < new Date()
  const doneCount = sessions.data?.filter((s) => s.done).length ?? 0
  const missed = new Set(status.data?.missed_session_ids)
  const reasons = status.data?.needs_replan ? replanReasons(status.data) : []

  let blocker: string | null = null
  if (!exam.due_at) blocker = "Set the exam's date in Settings to plan revision."
  else if (exam.covered_submodules.length === 0) blocker = 'Choose the topics this exam covers in Settings to plan revision.'
  else if (examPassed) blocker = 'This exam has already started.'

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {hasSessions ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            className="flex items-center gap-1.5 text-lg font-medium hover:text-foreground"
          >
            <ChevronRight className={cn('size-4 text-muted-foreground transition-transform', !collapsed && 'rotate-90')} />
            Revision plan
          </button>
        ) : (
          <h2 className="text-lg font-medium">Revision plan</h2>
        )}
        {hasSessions && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground tabular-nums">
              {doneCount} of {sessions.data?.length} done
            </span>
            {!examPassed && (
              <Button variant="ghost" size="sm" onClick={() => setReplanOpen(true)}>
                <RefreshCw /> Replan
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={clearPlan}>
              Clear plan
            </Button>
          </div>
        )}
      </div>

      {hasSessions && sessions.data && (
        <div
          className="h-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Revision plan progress"
          aria-valuemin={0}
          aria-valuemax={sessions.data.length}
          aria-valuenow={doneCount}
        >
          <motion.div
            className="h-full rounded-full bg-primary"
            style={color ? { backgroundColor: color } : undefined}
            initial={false}
            animate={{ width: `${(doneCount / sessions.data.length) * 100}%` }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          />
        </div>
      )}

      {sessions.loading && <Skeleton className="h-16 w-full" />}
      {sessions.error && !sessions.data && (
        <WidgetError
          message="Couldn't load the revision plan."
          onRetry={sessions.refetch}
          className="mb-2"
        />
      )}

      {sessions.data?.length === 0 &&
        (blocker ? (
          <p className="text-sm text-muted-foreground">{blocker}</p>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-4">
            <p className="text-sm text-muted-foreground">
              Spread revision for this exam across the days before it, weighted towards your weakest topics.
            </p>
            <Button size="sm" onClick={() => setPlanOpen(true)} className="shrink-0">
              <CalendarPlus /> Plan revision
            </Button>
          </div>
        ))}

      {reasons.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <p className="flex items-center gap-2">
            <TriangleAlert className="size-4 shrink-0" />
            <span>
              {reasons.join(' · ')} since you planned.
            </span>
          </p>
          <Button size="sm" variant="outline" onClick={() => setReplanOpen(true)} className="shrink-0">
            Replan
          </Button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {hasSessions && !collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <ul
              ref={listRef}
              className="relative max-h-44 divide-y overflow-y-auto overflow-x-hidden overscroll-contain pr-1"
            >
              {sortedSessions.map((s, idx) => (
                <motion.li
                  key={s.id}
                  layout="position"
                  transition={{ duration: 0.2 }}
                  ref={idx === upcomingIndex ? upcomingRef : undefined}
                  className="flex items-center gap-2 py-1.5"
                >
                  <Checkbox
                    checked={s.done}
                    aria-label={s.done ? 'Mark not done' : 'Mark done'}
                    onCheckedChange={(checked) => setDone(s.id, checked === true)}
                  />
                  <button
                    type="button"
                    onClick={() => openSession(s.id)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <span className={cn('shrink-0', s.done && 'text-muted-foreground line-through')}>
                      {formatSessionWhen(s)}
                      {missed.has(s.id) && <span className="ml-1.5 text-xs text-amber-700 dark:text-amber-300">Missed</span>}
                    </span>
                    <span className="truncate text-right text-muted-foreground">{s.submodules.map((t) => t.title).join(', ')}</span>
                  </button>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {exam.due_at && (
        <PlanRevisionDialog
          exam={{ ...exam, due_at: exam.due_at }}
          open={planOpen}
          onOpenChange={setPlanOpen}
          onPlanned={refetch}
        />
      )}
      {exam.due_at && sessions.data && (
        <PlanRevisionDialog
          exam={{ ...exam, due_at: exam.due_at }}
          mode="replan"
          initialForm={(today) => replanForm(sessions.data ?? [], today)}
          open={replanOpen}
          onOpenChange={setReplanOpen}
          onPlanned={refetch}
        />
      )}
      <RevisionSessionDialog
        sessionId={shownSessionId}
        open={requestedSessionId !== null}
        onOpenChange={(open) => !open && openSession(null)}
        onChanged={refetch}
      />
    </section>
  )
}

