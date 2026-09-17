import { ArrowLeft, FileText, Layers, Settings as SettingsIcon, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AttachmentList } from '@/components/AttachmentList'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  createFlashcard,
  deleteFlashcard,
  deleteSubmodule,
  getModule,
  getSubmodule,
  listFlashcards,
  updateSubmodule,
  uploadSubmoduleAttachment,
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

  const { data: module } = useAsync(() => getModule(Number(moduleId)), [moduleId])
  const { data: submodule, loading, error } = useAsync(() => getSubmodule(id), [id, reloadKey])
  const { data: flashcards } = useAsync(() => listFlashcards({ submoduleId: id }), [id, reloadKey])

  const [editingContent, setEditingContent] = useState(false)
  const [content, setContent] = useState('')

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)

  const [pdfOpen, setPdfOpen] = useState(false)
  const [flashcardsOpen, setFlashcardsOpen] = useState(false)

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

  function startEditingContent() {
    setContent(submodule!.content_markdown)
    setEditingContent(true)
  }

  async function saveContent() {
    setEditingContent(false)
    if (content !== submodule!.content_markdown) {
      await updateSubmodule(id, { content_markdown: content })
      refetch()
    }
  }

  function openSettings() {
    setTitleDraft(submodule!.title)
    setSettingsOpen(true)
  }

  async function saveTitle() {
    if (!titleDraft.trim()) return
    setSavingTitle(true)
    try {
      await updateSubmodule(id, { title: titleDraft.trim() })
      setSettingsOpen(false)
      refetch()
    } finally {
      setSavingTitle(false)
    }
  }

  async function handleDeleteSubmodule() {
    if (!confirm(`Delete "${submodule!.title}"? This removes its notes, attachments, and any linked flashcards.`)) return
    await deleteSubmodule(id)
    navigate(`/modules/${moduleId}`)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to={`/modules/${moduleId}`}
            aria-label="Back to module"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <span className="truncate text-sm text-muted-foreground">{module?.name}</span>
          <span className="text-muted-foreground">/</span>
          <span className="truncate text-sm font-medium">{submodule.title}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={openSettings}>
          <SettingsIcon /> Settings
        </Button>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        {editingContent ? (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={saveContent}
            placeholder="Start writing…"
            autoFocus
            className="min-h-[70vh] w-full resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
        ) : (
          <div onClick={startEditingContent} className="min-h-[70vh] cursor-text">
            {submodule.content_markdown.trim() ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{submodule.content_markdown}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Click to start writing…</p>
            )}
          </div>
        )}
      </main>

      <div className="fixed right-6 bottom-6 flex flex-col gap-3">
        <Button
          size="icon-lg"
          variant="secondary"
          className="rounded-full shadow-lg"
          aria-label="Files"
          onClick={() => setPdfOpen(true)}
        >
          <FileText />
        </Button>
        <Button
          size="icon-lg"
          className="rounded-full shadow-lg"
          aria-label="Flashcards"
          onClick={() => setFlashcardsOpen(true)}
        >
          <Layers />
        </Button>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submodule settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="submodule-title">Title</Label>
              <Input id="submodule-title" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
            </div>
            <div className="flex items-center justify-between pt-2">
              <Button size="sm" onClick={saveTitle} disabled={savingTitle}>
                {savingTitle ? 'Saving…' : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDeleteSubmodule}>
                Delete submodule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Files</DialogTitle>
          </DialogHeader>
          <AttachmentList
            attachments={submodule.attachments}
            upload={(file) => uploadSubmoduleAttachment(id, file)}
            onChanged={refetch}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={flashcardsOpen} onOpenChange={setFlashcardsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Flashcards</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <NewFlashcardForm moduleId={submodule.module_id} submoduleId={id} onCreated={refetch} />
            {flashcards?.length === 0 && <p className="text-sm text-muted-foreground">No flashcards yet.</p>}
            {flashcards && flashcards.length > 0 && (
              <ul className="max-h-80 divide-y overflow-y-auto">
                {flashcards.map((card) => (
                  <FlashcardRow key={card.id} card={card} onDeleted={refetch} />
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
