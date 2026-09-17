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
      className="min-h-32 w-full resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
    />
  )
}
