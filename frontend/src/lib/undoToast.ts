// "Deleted X · Undo" (#118). Every delete goes through here: the server deletes straight away and
// returns a token that undoes it for a couple of minutes, so the toast (mounted once in App.tsx, outside
// the routes) keeps working after navigating away.

import { toast } from 'sonner'

import { type DeleteResult, undoDelete } from '@/lib/api'

export const UNDO_TOAST_MS = 8000

/**
 * Runs `del` and offers to undo it. `del` may delete several things (a lecture series is one delete
 * per lecture); Undo puts them all back, newest first. `onUndone` runs once everything is back, e.g. to
 * refetch or to go back to the restored page. A failed delete throws, with nothing to undo.
 */
export async function deleteWithUndo({
  label,
  del,
  onUndone,
}: {
  /** "Linear Algebra", shown as `Deleted "Linear Algebra"`. */
  label: string
  del: () => Promise<DeleteResult | DeleteResult[]>
  onUndone?: () => void
}): Promise<void> {
  const result = await del()
  const tokens = (Array.isArray(result) ? result : [result]).map((r) => r.undo_token)
  toast(`Deleted “${label}”`, {
    duration: UNDO_TOAST_MS,
    action: {
      label: 'Undo',
      onClick: () => void undo(tokens, label, onUndone),
    },
  })
}

async function undo(tokens: string[], label: string, onUndone?: () => void) {
  try {
    for (const token of [...tokens].reverse()) await undoDelete(token)
    toast.success(`Restored “${label}”`)
    onUndone?.()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : `Couldn't restore “${label}”.`)
  }
}
