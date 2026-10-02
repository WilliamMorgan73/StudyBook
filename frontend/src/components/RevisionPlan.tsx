import { CalendarPlus, RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { PlanRevisionDialog } from '@/components/PlanRevisionDialog'
import { RevisionSessionDialog } from '@/components/RevisionSessionDialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  deleteRevisionPlan,
  getRevisionPlanStatus,
  listRevisionSessions,
  updateRevisionSession,
  type Assignment,
} from '@/lib/api'
import { formatSessionWhen, replanForm, replanReasons } from '@/lib/revision'
import { useAsync } from '@/lib/useAsync'

/**
 * An exam's revision plan on its Assignment page: "Plan revision" until there is one, then its sessions
 * with done ticks, Replan, and a nudge to replan when sessions were missed or weak topics shifted.
 * `?session=<id>` opens that session's view, which is how calendars link to a session.
 */
export function RevisionPlan({ exam }: { exam: Assignment }) {
  const sessions = useAsync(() => listRevisionSessions({ assignmentId: exam.id }), [exam.id])
  const status = useAsync(() => getRevisionPlanStatus(exam.id), [exam.id])
  const [planOpen, setPlanOpen] = useState(false)
  const [replanOpen, setReplanOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  const requestedSessionId = Number(searchParams.get('session')) || null
  // Kept after the param is cleared, so the dialog's content stays put while it animates closed.
  const [shownSessionId, setShownSessionId] = useState(requestedSessionId)
  if (requestedSessionId !== null && requestedSessionId !== shownSessionId) setShownSessionId(requestedSessionId)

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
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Revision plan</h2>
        {sessions.data && sessions.data.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {doneCount} of {sessions.data.length} done
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

      {sessions.loading && <Skeleton className="h-16 w-full" />}
      {sessions.error && !sessions.data && <p className="text-sm text-destructive">Couldn't load the revision plan.</p>}

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

      {sessions.data && sessions.data.length > 0 && (
        <ul className="divide-y">
          {sessions.data.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-1.5">
              <Checkbox
                checked={s.done}
                aria-label={s.done ? 'Mark not done' : 'Mark done'}
                onCheckedChange={(checked) => setDone(s.id, checked === true)}
              />
              <button
                type="button"
                onClick={() => openSession(s.id)}
                className="-mx-2 flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-1 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className={`shrink-0 ${s.done ? 'text-muted-foreground line-through' : ''}`}>
                  {formatSessionWhen(s)}
                  {missed.has(s.id) && <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">Missed</span>}
                </span>
                <span className="truncate text-muted-foreground">{s.submodules.map((t) => t.title).join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

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
