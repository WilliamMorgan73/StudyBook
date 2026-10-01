import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { PlanRevisionDialog } from '@/components/PlanRevisionDialog'
import { RevisionSessionDialog } from '@/components/RevisionSessionDialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { deleteRevisionPlan, listRevisionSessions, updateRevisionSession, type Assignment } from '@/lib/api'
import { formatSessionWhen } from '@/lib/revision'
import { useAsync } from '@/lib/useAsync'

/**
 * An exam's revision plan on its Assignment page: "Plan revision" until there is one, then its sessions
 * with done ticks. `?session=<id>` opens that session's view, which is how calendars link to a session.
 */
export function RevisionPlan({ exam }: { exam: Assignment }) {
  const sessions = useAsync(() => listRevisionSessions({ assignmentId: exam.id }), [exam.id])
  const [planOpen, setPlanOpen] = useState(false)
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

  async function setDone(id: number, done: boolean) {
    await updateRevisionSession(id, { done })
    await sessions.refetch()
  }

  async function clearPlan() {
    if (!confirm('Delete every session in this revision plan, including ones ticked done?')) return
    await deleteRevisionPlan(exam.id)
    await sessions.refetch()
  }

  const examPassed = exam.due_at !== null && new Date(exam.due_at) < new Date()
  const doneCount = sessions.data?.filter((s) => s.done).length ?? 0

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
          onPlanned={sessions.refetch}
        />
      )}
      <RevisionSessionDialog
        sessionId={shownSessionId}
        open={requestedSessionId !== null}
        onOpenChange={(open) => !open && openSession(null)}
        onChanged={sessions.refetch}
      />
    </section>
  )
}
