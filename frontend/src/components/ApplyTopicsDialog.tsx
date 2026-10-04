import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { setLecturesSubmodules } from '@/lib/api'
import type { TopicScope } from '@/lib/lectureSchedule'

/**
 * Asks which lectures a topic change goes to (only this one, the same weekday and time, the series),
 * then gives each exactly `submoduleIds`, replacing what they had.
 */
export function ApplyTopicsDialog({
  scopes,
  submoduleIds,
  onOpenChange,
  onApplied,
}: {
  /** Null keeps the dialog closed. */
  scopes: TopicScope[] | null
  submoduleIds: number[]
  onOpenChange: (open: boolean) => void
  onApplied: () => void | Promise<void>
}) {
  const [choice, setChoice] = useState<TopicScope['id']>('this')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function apply() {
    const scope = scopes?.find((s) => s.id === choice)
    if (!scope) return
    setSaving(true)
    setError(null)
    try {
      await setLecturesSubmodules(scope.lectureIds, submoduleIds)
      await onApplied()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={scopes !== null}
      onOpenChange={(open) => {
        if (!open) setChoice('this')
        onOpenChange(open)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply topics to…</DialogTitle>
          <DialogDescription>The lectures you pick get exactly these topics, replacing what they had.</DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-1.5">
          <legend className="sr-only">Lectures to change</legend>
          {scopes?.map((scope) => (
            <label
              key={scope.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-checked:border-foreground/40 has-checked:bg-muted"
            >
              <input
                type="radio"
                name="topic-scope"
                value={scope.id}
                checked={choice === scope.id}
                onChange={() => setChoice(scope.id)}
                className="accent-foreground"
              />
              {scope.label}
            </label>
          ))}
        </fieldset>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={apply} disabled={saving}>
            {saving ? 'Applying…' : 'Apply'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
