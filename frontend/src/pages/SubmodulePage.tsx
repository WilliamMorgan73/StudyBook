import { Paperclip, Trash2 } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  createFlashcard,
  deleteFlashcard,
  deleteSubmodule,
  getSubmodule,
  listFlashcards,
  updateSubmodule,
  uploadAttachment,
  type Flashcard,
} from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

function NewFlashcardForm({ moduleId, submoduleId, onCreated }: { moduleId: number; submoduleId: number; onCreated: () => void }) {
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!front.trim() || !back.trim()) {
      setError('Both sides of the card are required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createFlashcard({ module_id: moduleId, submodule_id: submoduleId, front: front.trim(), back: back.trim() })
      setFront('')
      setBack('')
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the flashcard.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-xl bg-muted/50 p-3">
      <div className="min-w-40 flex-1 space-y-1.5">
        <Label htmlFor="flashcard-front">Front</Label>
        <Input id="flashcard-front" value={front} onChange={(e) => setFront(e.target.value)} placeholder="Question" />
      </div>
      <div className="min-w-40 flex-1 space-y-1.5">
        <Label htmlFor="flashcard-back">Back</Label>
        <Input id="flashcard-back" value={back} onChange={(e) => setBack(e.target.value)} placeholder="Answer" />
      </div>
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add card'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  )
}

function FlashcardRow({ card, onDeleted }: { card: Flashcard; onDeleted: () => void }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-medium">{card.front}</p>
        <p className="truncate text-sm text-muted-foreground">{card.back}</p>
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Delete flashcard"
        onClick={async () => {
          await deleteFlashcard(card.id)
          onDeleted()
        }}
      >
        <Trash2 />
      </Button>
    </li>
  )
}

export function SubmodulePage() {
  const { moduleId, submoduleId } = useParams()
  const navigate = useNavigate()
  const id = Number(submoduleId)
  const [reloadKey, setReloadKey] = useState(0)
  const refetch = () => setReloadKey((k) => k + 1)

  const { data: submodule, loading, error } = useAsync(() => getSubmodule(id), [id, reloadKey])
  const { data: flashcards } = useAsync(() => listFlashcards({ submoduleId: id }), [id, reloadKey])

  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error || !submodule) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <Link to={`/modules/${moduleId}`} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Module
        </Link>
        <p className="text-sm text-destructive">This submodule couldn't be found.</p>
      </div>
    )
  }

  async function startEditing() {
    setContent(submodule!.content_markdown)
    setEditing(true)
  }

  async function saveContent() {
    setSaving(true)
    try {
      await updateSubmodule(id, { content_markdown: content })
      setEditing(false)
      refetch()
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      await uploadAttachment(id, file)
      refetch()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not upload the file.')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleDeleteSubmodule() {
    if (!confirm(`Delete "${submodule!.title}"? This removes its notes, attachments, and any linked flashcards.`)) return
    await deleteSubmodule(id)
    navigate(`/modules/${moduleId}`)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
      <div className="flex items-center justify-between">
        <Link to={`/modules/${moduleId}`} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Module
        </Link>
        <Button variant="ghost" size="sm" onClick={handleDeleteSubmodule}>
          Delete submodule
        </Button>
      </div>

      <h1 className="text-2xl font-semibold">{submodule.title}</h1>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Notes</h2>
          {!editing && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              Edit
            </Button>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={14}
              className="font-mono text-sm"
              placeholder="Write in Markdown…"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveContent} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : submodule.content_markdown.trim() ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{submodule.content_markdown}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Lecture notes</h2>
          <div>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.ppt,.pptx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleUpload(file)
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload PDF/PPTX'}
            </Button>
          </div>
        </div>
        {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
        {submodule.attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files attached yet.</p>
        ) : (
          <ul className="divide-y">
            {submodule.attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 py-2">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                <a href={a.url} target="_blank" rel="noreferrer" className="truncate text-sm hover:underline">
                  {a.filename}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Flashcards</h2>
        <NewFlashcardForm moduleId={submodule.module_id} submoduleId={id} onCreated={refetch} />
        {flashcards?.length === 0 && <p className="text-sm text-muted-foreground">No flashcards yet.</p>}
        {flashcards && flashcards.length > 0 && (
          <ul className="divide-y">
            {flashcards.map((card) => (
              <FlashcardRow key={card.id} card={card} onDeleted={refetch} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
