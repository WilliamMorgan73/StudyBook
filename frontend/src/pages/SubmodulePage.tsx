import { ArrowLeft, Code2, FileText, Layers, Settings as SettingsIcon, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AttachmentList } from '@/components/AttachmentList'
import { MarkdownEditor } from '@/components/MarkdownEditor'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  createFlashcard,
  deleteFlashcard,
  deleteSubmodule,
  getAppSettings,
  getModule,
  getSubmodule,
  listFlashcards,
  resolveWikilink,
  updateSubmodule,
  uploadSubmoduleAttachment,
  type Flashcard,
} from '@/lib/api'
import { DEFAULT_KEYBINDS } from '@/lib/keybinds'
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
  const { data: appSettings } = useAsync(() => getAppSettings(), [])

  const [content, setContent] = useState('')
  const [sourceMode, setSourceMode] = useState(false)

  const [settingsOpen, setSettingsOpen] = useState(false)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const [pdfOpen, setPdfOpen] = useState(false)
  const [flashcardsOpen, setFlashcardsOpen] = useState(false)

  useEffect(() => {
    if (submodule) setContent(submodule.content_markdown)
  }, [submodule?.id])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-8 py-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error || !submodule) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-8 py-8">
        <Link to={`/modules/${moduleId}`} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Module
        </Link>
        <p className="text-sm text-destructive">This submodule couldn't be found.</p>
      </div>
    )
  }

  async function saveContent() {
    if (content !== submodule!.content_markdown) {
      await updateSubmodule(id, { content_markdown: content })
      refetch()
    }
  }

  function startEditingTitle() {
    setTitleDraft(submodule!.title)
    setEditingTitle(true)
  }

  async function saveTitle() {
    setEditingTitle(false)
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== submodule!.title) {
      await updateSubmodule(id, { title: trimmed })
      refetch()
    }
  }

  async function handleDeleteSubmodule() {
    if (!confirm(`Delete "${submodule!.title}"? This removes its notes, attachments, and any linked flashcards.`)) return
    await deleteSubmodule(id)
    navigate(`/modules/${moduleId}`)
  }

  async function handleNavigateWikilink(title: string) {
    try {
      const target = await resolveWikilink(title, submodule!.module_id)
      navigate(`/modules/${target.module_id}/submodules/${target.id}`)
    } catch {
      // Unresolved link (typo, or the note doesn't exist yet) — no-op, nothing to navigate to.
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        left={
          <>
            <Link
              to={`/modules/${moduleId}`}
              aria-label="Back to module"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <span className="truncate text-sm text-muted-foreground">{module?.name}</span>
            <span className="text-muted-foreground">/</span>
            {editingTitle ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') {
                    setTitleDraft(submodule!.title)
                    e.currentTarget.blur()
                  }
                }}
                autoFocus
                className="min-w-0 truncate border-b border-foreground bg-transparent text-sm font-medium outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={startEditingTitle}
                className="truncate text-sm font-medium hover:underline"
              >
                {submodule.title}
              </button>
            )}
          </>
        }
        right={
          <>
            <Button
              variant={sourceMode ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSourceMode((s) => !s)}
            >
              <Code2 /> Source
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon /> Settings
            </Button>
          </>
        }
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-10">
        <MarkdownEditor
          value={content}
          onChange={setContent}
          onBlur={saveContent}
          sourceMode={sourceMode}
          placeholder="Start writing…"
          minHeight="70vh"
          onNavigateWikilink={handleNavigateWikilink}
          fontSize={appSettings?.note_font_size}
          tableAlign={appSettings?.table_alignment}
          keybinds={
            appSettings
              ? {
                  bold: appSettings.keybind_bold,
                  italic: appSettings.keybind_italic,
                  code: appSettings.keybind_code,
                  wikilink: appSettings.keybind_wikilink,
                }
              : DEFAULT_KEYBINDS
          }
        />
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
            <p className="text-sm text-muted-foreground">
              Deleting a submodule removes its notes, attachments, and any linked flashcards.
            </p>
            <Button size="sm" variant="ghost" onClick={handleDeleteSubmodule}>
              Delete submodule
            </Button>
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
