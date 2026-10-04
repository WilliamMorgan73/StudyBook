import { useEffect, useState } from 'react'

import { Textarea } from '@/components/ui/textarea'
import { getQuickNote, updateQuickNote } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'
import { useSampleData } from '@/lib/sampleData'

/** A borderless textarea that fills its widget and saves on blur when the text changed. */
export function NotepadArea({ value, onSave }: { value: string; onSave: (content: string) => Promise<unknown> }) {
  const [content, setContent] = useState(value)

  useEffect(() => {
    setContent(value)
  }, [value])

  async function handleBlur() {
    if (content !== value) await onSave(content)
  }

  return (
    <Textarea
      value={content}
      onChange={(e) => setContent(e.target.value)}
      onBlur={handleBlur}
      placeholder="Jot something down…"
      // Fills its dashboard widget however big that is, and scrolls inside it.
      className="min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent p-0 text-sm shadow-none [field-sizing:fixed] focus-visible:ring-0"
    />
  )
}

/** The Overview's notepad. */
export function QuickNotepad() {
  const sample = useSampleData()
  const note = useAsync(() => (sample ? Promise.resolve(sample.quickNote) : getQuickNote()), [])
  return <NotepadArea value={note.data?.content ?? ''} onSave={updateQuickNote} />
}
