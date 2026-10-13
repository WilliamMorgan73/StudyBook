import { useMemo, useState } from 'react'

import {
  addableWidgets,
  addWidget,
  canAddWidget,
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
  /** Widget types "Add widget" offers. */
  addable: Id[]
  saving: boolean
  saveError: string | null
  start: () => void
  cancel: () => void
  reset: () => void
  add: (type: Id) => void
  /** Removes one widget, by instance id. */
  remove: (id: string) => void
  canAdd: (type: Id) => boolean
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
    addable: addableWidgets(board, layout),
    saving,
    saveError,
    start: () => {
      setSaveError(null)
      setDraft(saved)
    },
    cancel: () => setDraft(null),
    reset: () => setDraft(board.defaultLayout),
    add: (type) => setDraft((current) => addWidget(board, current ?? saved, type)),
    remove: (id) => setDraft((current) => removeWidget(current ?? saved, id)),
    canAdd: (type) => canAddWidget(board, layout, type),
    setDraft,
    save,
  }
}
