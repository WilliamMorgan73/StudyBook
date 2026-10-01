import { useEffect, useState } from 'react'

import { Textarea } from '@/components/ui/textarea'
import { getQuickNote, updateQuickNote } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

export function QuickNotepad() {
  const note = useAsync(() => getQuickNote(), [])
  const [content, setContent] = useState('')

  useEffect(() => {
    if (note.data) setContent(note.data.content ?? '')
  }, [note.data])

  async function handleBlur() {
    if (content !== (note.data?.content ?? '')) {
      await updateQuickNote(content)
    }
  }

  return (
    <Textarea
      value={content}
      onChange={(e) => setContent(e.target.value)}
      onBlur={handleBlur}
      placeholder="Jot something down…"
      // Grows with its text up to max-h-64 on narrow screens; at lg it fills the card and scrolls.
      className="max-h-64 min-h-32 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 lg:max-h-none lg:min-h-0 lg:[field-sizing:fixed]"
    />
  )
}
