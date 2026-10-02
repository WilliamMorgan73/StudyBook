import { ArrowLeft, Code2, Settings as SettingsIcon, SquarePlus } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AssignmentChecklist } from '@/components/AssignmentChecklist'
import { AssignmentCompletion } from '@/components/AssignmentCompletion'
import { AssignmentSettingsDialog } from '@/components/AssignmentSettingsDialog'
import { AttachmentEmbeds } from '@/components/AttachmentEmbeds'
import { Countdown } from '@/components/Countdown'
import { MarkdownEditor, type MarkdownEditorHandle } from '@/components/MarkdownEditor'
import { PageHeader } from '@/components/PageHeader'
import { RevisionPlan } from '@/components/RevisionPlan'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getAppSettings,
  getAssignment,
  getModule,
  resolveWikilink,
  updateAssignment,
  uploadAssignmentAttachment,
  type AppSettings,
  type Assignment,
  type ModuleDetail,
} from '@/lib/api'
import { examEndsAt } from '@/lib/exam'
import { DEFAULT_KEYBINDS } from '@/lib/keybinds'
import { useAsync } from '@/lib/useAsync'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** "Exam Jun 1, 2026, 9:00 AM – 11:00 AM · Sports Hall": an exam's `due_at` is its start time. */
function formatExamWhen(startsAt: string, durationMinutes: number | null, location: string | null) {
  const end = examEndsAt(startsAt, durationMinutes)
  return (
    `Exam ${formatDate(startsAt)}, ${formatTime(new Date(startsAt))}` +
    (end ? ` – ${formatTime(end)}` : '') +
    (location ? ` · ${location}` : '')
  )
}

export function AssignmentPage() {
  const { moduleId, assignmentId } = useParams()
  const id = Number(assignmentId)
  const { data: assignment, loading, refetch } = useAsync(() => getAssignment(id), [id])
  const { data: module } = useAsync(() => getModule(Number(moduleId)), [moduleId])
  const { data: appSettings } = useAsync(() => getAppSettings(), [])

  if (loading && !assignment) {
    return (
      <div className="space-y-4 px-8 py-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  // Not loading and no data means the first load failed; a failed refresh keeps the data.
  if (!assignment) {
    return (
      <div className="space-y-4 px-8 py-8">
        <Link to={`/modules/${moduleId}`} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Module
        </Link>
        <p className="text-sm text-destructive">This assignment couldn't be found.</p>
      </div>
    )
  }

  // Keyed by id so another Assignment gets a fresh view, its editor seeded from those notes;
  // refetches of this one (ticking a step, uploading a file) keep the view and unsaved typing.
  return (
    <AssignmentView
      key={assignment.id}
      assignment={assignment}
      module={module}
      appSettings={appSettings}
      refetch={refetch}
    />
  )
}

function AssignmentView({
  assignment,
  module,
  appSettings,
  refetch,
}: {
  assignment: Assignment
  module: ModuleDetail | null
  appSettings: AppSettings | null
  refetch: () => Promise<void>
}) {
  const { moduleId } = useParams()
  const navigate = useNavigate()
  const id = assignment.id

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sourceMode, setSourceMode] = useState(false)
  const editorRef = useRef<MarkdownEditorHandle>(null)

  const [notes, setNotes] = useState(assignment.notes_markdown)
  // Mirrors `notes` for saveNotes: the editor can ask for a save straight after an edit
  // (onCommit), before a re-render would give saveNotes's closure the new value.
  const notesRef = useRef(assignment.notes_markdown)

  function updateNotes(value: string) {
    notesRef.current = value
    setNotes(value)
  }

  const overdue =
    assignment.status !== 'graded' && assignment.due_at !== null && new Date(assignment.due_at) < new Date()
  const isExam = assignment.kind === 'exam'

  async function saveNotes() {
    const latest = notesRef.current
    if (latest !== assignment.notes_markdown) {
      await updateAssignment(id, { notes_markdown: latest })
      refetch()
    }
  }

  // Resolves once the refetched Assignment lists the new Attachment, so an embed of it renders
  // straight away instead of as "missing".
  async function uploadToNotes(file: File) {
    const attachment = await uploadAssignmentAttachment(id, file)
    await refetch()
    return attachment
  }

  async function handleNavigateWikilink(title: string) {
    try {
      const target = await resolveWikilink(title, assignment.module_id)
      // Cmd/Ctrl+click navigates without a DOM blur, so flush edits before the route swap unmounts us.
      await saveNotes()
      navigate(`/modules/${target.module_id}/submodules/${target.id}`)
    } catch {
      // Unresolved link: nothing to navigate to.
    }
  }

  return (
    <div className="min-h-full">
      <PageHeader
        left={
          <Link
            to={`/modules/${moduleId}`}
            aria-label={`Back to ${module?.name ?? 'module'}`}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4 shrink-0" />
            <span className="truncate">{module?.name}</span>
          </Link>
        }
        right={
          <>
            <Button variant="ghost" size="sm" onClick={() => editorRef.current?.openBlockDialog()}>
              <SquarePlus /> Insert
            </Button>
            <Button variant={sourceMode ? 'secondary' : 'ghost'} size="sm" onClick={() => setSourceMode((s) => !s)}>
              <Code2 /> Source
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon /> Settings
            </Button>
          </>
        }
      />

      <div className="border-b" style={{ backgroundColor: module ? `${module.color}1f` : undefined }}>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-6 px-8 pt-12 pb-8">
          <div className="min-w-0 flex-1 basis-96">
            <h1 className="text-4xl font-semibold text-balance">{assignment.title}</h1>
            <p className="mt-1 text-base text-muted-foreground">
              <span className={overdue ? 'font-medium text-destructive' : ''}>
                {!assignment.due_at
                  ? 'No due date'
                  : isExam
                    ? formatExamWhen(assignment.due_at, assignment.duration_minutes, assignment.location)
                    : `Due ${formatDate(assignment.due_at)}`}
              </span>
              {`, worth ${assignment.weight_percent}% of the grade`}
            </p>
            {assignment.description && (
              <p className="mt-4 max-w-prose text-sm text-pretty text-foreground/80">{assignment.description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-8 text-right">
            {/* Slides over as the completion controls beside it change width. */}
            <motion.div layout="position" transition={{ duration: 0.2 }}>
              <Countdown
                target={assignment.due_at}
                noneLabel="No due date"
                arrivedLabel={isExam ? 'Exam started' : 'Due now'}
              />
            </motion.div>
            <AssignmentCompletion assignment={assignment} onChanged={refetch} />
          </div>
        </div>

        {assignment.covered_submodules.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-8 pb-6">
            <h2 className="text-sm text-muted-foreground">Covers</h2>
            <ul className="flex flex-wrap gap-1.5">
              {assignment.covered_submodules.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/modules/${moduleId}/submodules/${s.id}`}
                    className="inline-block rounded-full border bg-background/70 px-3 py-0.5 text-sm transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    style={module ? { borderColor: `${module.color}66` } : undefined}
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid gap-x-10 gap-y-10 px-8 py-10 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <main className="min-w-0 rounded-xl border bg-card px-6 py-5 sm:px-10 sm:py-8 max-h-[60vh] overflow-y-auto lg:sticky lg:top-6 lg:self-start">
          <MarkdownEditor
            ref={editorRef}
            value={notes}
            onChange={updateNotes}
            onBlur={saveNotes}
            onCommit={saveNotes}
            attachments={assignment.attachments}
            onUploadFile={uploadToNotes}
            sourceMode={sourceMode}
            placeholder="Plan the work, draft an outline, collect quotes…"
            minHeight="60vh"
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

        <aside className="space-y-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1 lg:pb-6">
          <AssignmentChecklist assignmentId={id} todos={assignment.todos} color={module?.color} onChanged={refetch} />
          {isExam && <RevisionPlan exam={assignment} color={module?.color} />}
          <AttachmentEmbeds
            attachments={assignment.attachments}
            upload={(file) => uploadAssignmentAttachment(id, file)}
            onChanged={refetch}
          />
        </aside>
      </div>

      <AssignmentSettingsDialog
        moduleId={Number(moduleId)}
        assignment={assignment}
        submodules={module?.submodules ?? []}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onChanged={refetch}
      />
    </div>
  )
}
