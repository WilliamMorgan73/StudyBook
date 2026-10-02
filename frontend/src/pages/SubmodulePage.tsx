import { ArrowLeft, Code2, FileText, Layers, ScrollText, Settings as SettingsIcon, SquarePlus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AIActionButton } from '@/components/AIActionButton'
import { AttachmentList } from '@/components/AttachmentList'
import { GenerateFlashcardsDialog } from '@/components/GenerateFlashcardsDialog'
import { MarkdownEditor, type MarkdownEditorHandle } from '@/components/MarkdownEditor'
import { PageHeader } from '@/components/PageHeader'
import { StudySession } from '@/components/StudySession'
import { SubmoduleSummary, SummarizeDialog } from '@/components/SubmoduleSummary'
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
  type AppSettings,
  type Flashcard,
  type ModuleDetail,
  type SubmoduleDetail,
} from '@/lib/api'
import { DEFAULT_KEYBINDS } from '@/lib/keybinds'
import { listItem } from '@/lib/motion'
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
    // Padding lives on the inner row so the exit can collapse the <li> all the way to zero.
    <motion.li variants={listItem} initial="hidden" animate="shown" exit="exit">
      <div className="flex items-center justify-between gap-3 py-2">
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
      </div>
    </motion.li>
  )
}

export function SubmodulePage() {
  const { moduleId, submoduleId } = useParams()
  const id = Number(submoduleId)
  const { data: module } = useAsync(() => getModule(Number(moduleId)), [moduleId])
  const { data: submodule, loading, refetch: refetchSubmodule } = useAsync(() => getSubmodule(id), [id])
  const { data: appSettings } = useAsync(() => getAppSettings(), [])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-8 py-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  // Not loading and no data means the first load failed; a failed refresh keeps the data.
  if (!submodule) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-8 py-8">
        <Link to={`/modules/${moduleId}`} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Module
        </Link>
        <p className="text-sm text-destructive">This submodule couldn't be found.</p>
      </div>
    )
  }

  // Keyed by id so another Submodule gets a fresh view, its editor seeded from that note; refetches
  // of this one keep the view (and unsaved typing) in place.
  return (
    <SubmoduleView
      key={submodule.id}
      submodule={submodule}
      module={module}
      appSettings={appSettings}
      refetchSubmodule={refetchSubmodule}
    />
  )
}

function SubmoduleView({
  submodule,
  module,
  appSettings,
  refetchSubmodule,
}: {
  submodule: SubmoduleDetail
  module: ModuleDetail | null
  appSettings: AppSettings | null
  refetchSubmodule: () => Promise<void>
}) {
  const { moduleId } = useParams()
  const navigate = useNavigate()
  const id = submodule.id
  const { data: flashcards, refetch: refetchFlashcards } = useAsync(() => listFlashcards({ submoduleId: id }), [id])
  // Saves here can touch the note or its flashcards, so refresh both together.
  const refetch = () => Promise.all([refetchSubmodule(), refetchFlashcards()])

  const [content, setContent] = useState(submodule.content_markdown)
  // Mirrors `content` for saveContent: the editor can ask for a save straight after an edit
  // (onCommit), before a re-render would give saveContent's closure the new value.
  const contentRef = useRef(submodule.content_markdown)

  function updateContent(value: string) {
    contentRef.current = value
    setContent(value)
  }
  const [sourceMode, setSourceMode] = useState(false)

  const [settingsOpen, setSettingsOpen] = useState(false)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const [pdfOpen, setPdfOpen] = useState(false)
  const [flashcardsOpen, setFlashcardsOpen] = useState(false)
  const [summarizeOpen, setSummarizeOpen] = useState(false)
  const editorRef = useRef<MarkdownEditorHandle>(null)

  // Resolves once the refetched Submodule lists the new Attachment, so an embed of it renders
  // straight away instead of as "missing".
  async function uploadToNote(file: File) {
    const attachment = await uploadSubmoduleAttachment(id, file)
    await refetchSubmodule()
    return attachment
  }

  async function saveContent() {
    const latest = contentRef.current
    if (latest !== submodule.content_markdown) {
      await updateSubmodule(id, { content_markdown: latest })
      refetch()
    }
  }

  async function openSummarize() {
    // Flush unsaved note edits first so the summary (and its source hash) reflects them.
    await saveContent()
    setSummarizeOpen(true)
  }

  function startEditingTitle() {
    setTitleDraft(submodule.title)
    setEditingTitle(true)
  }

  async function saveTitle() {
    setEditingTitle(false)
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== submodule.title) {
      await updateSubmodule(id, { title: trimmed })
      refetch()
    }
  }

  async function handleDeleteSubmodule() {
    if (!confirm(`Delete "${submodule.title}"? This removes its notes, attachments, and any linked flashcards.`)) return
    await deleteSubmodule(id)
    navigate(`/modules/${moduleId}`)
  }

  async function handleNavigateWikilink(title: string) {
    try {
      const target = await resolveWikilink(title, submodule.module_id)
      // Cmd/Ctrl+click navigates straight from a click handler inside the editor, not via a DOM
      // blur — so the usual onBlur={saveContent} on MarkdownEditor never fires, and this route
      // swap would otherwise unmount the page (and any unsaved edits) before they're persisted.
      await saveContent()
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
          aria-label={`Back to ${module?.name ?? "module"}`}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4 shrink-0" />
            <span className="truncate">{module?.name}</span>
        </Link>
            <span className="text-muted-foreground">/</span>
            {editingTitle ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') {
                    setTitleDraft(submodule.title)
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
            <StudySession scope={{ submoduleId: id }} title={submodule.title} />
            <GenerateFlashcardsDialog
              submodule={submodule}
              aiEnabled={appSettings?.ai_enabled}
              beforeOpen={saveContent}
              onSaved={refetch}
            />
            {/* Once a summary exists, Regenerate lives on the summary block instead. */}
            {submodule.summary_markdown === null && (
              <AIActionButton size="sm" variant="outline" aiEnabled={appSettings?.ai_enabled} onClick={openSummarize}>
                <ScrollText /> Summarize
              </AIActionButton>
            )}
            <Button variant="ghost" size="sm" onClick={() => editorRef.current?.openBlockDialog()}>
              <SquarePlus /> Insert
            </Button>
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
        <SubmoduleSummary submodule={submodule} aiEnabled={appSettings?.ai_enabled} onRegenerate={openSummarize} />
        <MarkdownEditor
          ref={editorRef}
          value={content}
          onChange={updateContent}
          onBlur={saveContent}
          onCommit={saveContent}
          attachments={submodule.attachments}
          onUploadFile={uploadToNote}
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

      <SummarizeDialog
        submodule={submodule}
        open={summarizeOpen}
        onOpenChange={setSummarizeOpen}
        onSummarized={() => refetchSubmodule()}
      />

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
                <AnimatePresence initial={false}>
                  {flashcards.map((card) => (
                    <FlashcardRow key={card.id} card={card} onDeleted={refetch} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
