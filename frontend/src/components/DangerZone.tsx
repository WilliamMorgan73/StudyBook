import { useState } from 'react'

import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The delete row at the bottom of a settings dialog (#118): set apart from Save, solid red. There's no
 * confirm step; the delete shows an Undo toast instead (`lib/undoToast.ts`).
 */
export function DangerZone({
  action,
  description,
  onDelete,
  className,
}: {
  /** "Delete module". */
  action: string
  /** What goes with it, e.g. "Its topics, notes, flashcards and files go too. You can undo for a few seconds." */
  description: string
  onDelete: () => Promise<void>
  /** Its spacing; by default it sits apart from the form above it. */
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await onDelete()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete it.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('mt-6 flex items-center justify-between gap-4 rounded-lg border border-destructive/30 p-3', className)}>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">Danger zone</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <Button size="sm" variant="danger" onClick={handleDelete} disabled={busy} className="shrink-0">
        <Trash2 />
        {action}
      </Button>
    </div>
  )
}
