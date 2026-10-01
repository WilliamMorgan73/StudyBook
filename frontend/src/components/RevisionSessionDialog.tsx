import { useState } from 'react'
import { Link } from 'react-router-dom'

import { MarkdownView } from '@/components/MarkdownView'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { getRevisionSession, updateRevisionSession } from '@/lib/api'
import { formatSessionWhen, weaknessLabel } from '@/lib/revision'
import { useAsync } from '@/lib/useAsync'

const WEAKNESS_STYLE = {
  Weak: 'text-destructive',
  Fair: 'text-muted-foreground',
  Strong: 'text-emerald-600 dark:text-emerald-400',
} as const

/**
 * The session view: done tick, the session's topics with their current weakness, and the weakest cards
 * in them. Shows the session's AI guidance above that once it has some (#13).
 */
export function RevisionSessionDialog({
  sessionId,
  open,
  onOpenChange,
  onChanged,
}: {
  /** Kept set while closing so the content doesn't blank out during the close animation. */
  sessionId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  return (
    <Dialog open={open && sessionId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {/* Keyed so switching sessions refetches. */}
        {sessionId !== null && <RevisionSessionBody key={sessionId} sessionId={sessionId} onChanged={onChanged} />}
      </DialogContent>
    </Dialog>
  )
}

function RevisionSessionBody({ sessionId, onChanged }: { sessionId: number; onChanged: () => void }) {
  const { data: session, loading, error, refetch } = useAsync(() => getRevisionSession(sessionId), [sessionId])
  const [saving, setSaving] = useState(false)

  if (loading) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Revision session</DialogTitle>
          <DialogDescription>Loading…</DialogDescription>
        </DialogHeader>
        <Skeleton className="h-48 w-full" />
      </>
    )
  }
  if (!session) {
    return (
      <DialogHeader>
        <DialogTitle>Revision session</DialogTitle>
        <DialogDescription className="text-destructive">{error?.message ?? "This session couldn't be found."}</DialogDescription>
      </DialogHeader>
    )
  }

  async function setDone(done: boolean) {
    setSaving(true)
    try {
      await updateRevisionSession(sessionId, { done })
      await refetch()
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <DialogHeader>
        <DialogTitle className="pr-8">Revise: {session.exam_title}</DialogTitle>
        <DialogDescription>{formatSessionWhen(session)}</DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-2">
        <Checkbox
          id="revision-session-done"
          checked={session.done}
          disabled={saving}
          onCheckedChange={(checked) => setDone(checked === true)}
        />
        <Label htmlFor="revision-session-done">Done</Label>
      </div>

      {session.guidance_markdown && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Guidance</h3>
          <MarkdownView className="prose-sm">{session.guidance_markdown}</MarkdownView>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Topics</h3>
        <ul className="divide-y rounded-lg border">
          {session.topics.map((topic) => {
            const label = weaknessLabel(topic.weakness)
            return (
              <li key={topic.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <Link
                  to={`/modules/${session.module_id}/submodules/${topic.id}`}
                  className="min-w-0 truncate font-medium hover:underline"
                >
                  {topic.title}
                </Link>
                <span className={`shrink-0 text-xs ${WEAKNESS_STYLE[label]}`}>{label}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Weakest cards</h3>
        {session.weakest_cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reviewed flashcards in these topics yet. Study them to see which cards need work.
          </p>
        ) : (
          <ul className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
            {session.weakest_cards.map((card) => (
              <li key={card.id} className="grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-2">
                <MarkdownView className="prose-sm min-w-0">{card.front}</MarkdownView>
                <div className="min-w-0 space-y-1 sm:border-l sm:pl-3">
                  <MarkdownView className="prose-sm text-muted-foreground">{card.back}</MarkdownView>
                  <p className="text-xs text-muted-foreground">
                    Missed {Math.round(card.lapse_rate * 100)}% of the last {card.review_count} review
                    {card.review_count === 1 ? '' : 's'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
