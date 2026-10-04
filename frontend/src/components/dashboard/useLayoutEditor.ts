import { useMemo, useState } from 'react'

import {
  addWidget,
  canAddWidget,
  hiddenWidgets,
  normalizeLayout,
  removeWidget,
  sameLayout,
  type Board,
  type LayoutItem,
} from '@/lib/dashboardLayout'

export interface LayoutEditor<Id extends string> {
  board: Board<Id>
  /** The layout to show: the draft while editing, else the saved one. */
  layout: LayoutItem<Id>[]
  editing: boolean
  /** Widgets not on the layout, for "Add widget". */
  hidden: Id[]
  saving: boolean
  saveError: string | null
  start: () => void
  cancel: () => void
  reset: () => void
  add: (id: Id) => void
  remove: (id: Id) => void
  canAdd: (id: Id) => boolean
  /** The grid's `onLayoutChange` while editing. */
  setDraft: (layout: LayoutItem<Id>[]) => void
  save: () => Promise<void>
}

/**
 * Edit mode for a dashboard board. `stored` is the layout as saved (anything; it goes through
 * `normalizeLayout`), and `persist` saves a layout, or null for the board's default so it keeps
 * tracking the default if that changes.
 */
export function useLayoutEditor<Id extends string>(
  board: Board<Id>,
  stored: unknown,
  persist: (layout: LayoutItem<Id>[] | null) => Promise<void>,
): LayoutEditor<Id> {
  // The layout being edited; null when not in edit mode.
  const [draft, setDraft] = useState<LayoutItem<Id>[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const saved = useMemo(() => normalizeLayout(board, stored), [board, stored])
  const layout = draft ?? saved

  async function save() {
    if (draft === null) return
    setSaving(true)
    setSaveError(null)
    try {
      await persist(sameLayout(draft, board.defaultLayout) ? null : draft)
      setDraft(null)
    } catch {
      setSaveError("Couldn't save the layout.")
    } finally {
      setSaving(false)
    }
  }

  return {
    board,
    layout,
    editing: draft !== null,
    hidden: hiddenWidgets(board, layout),
    saving,
    saveError,
    start: () => {
      setSaveError(null)
      setDraft(saved)
    },
    cancel: () => setDraft(null),
    reset: () => setDraft(board.defaultLayout),
    add: (id) => setDraft((current) => addWidget(board, current ?? saved, id)),
    remove: (id) => setDraft((current) => removeWidget(current ?? saved, id)),
    canAdd: (id) => canAddWidget(board, layout, id),
    setDraft,
    save,
  }
}
