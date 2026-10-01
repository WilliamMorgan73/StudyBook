import { Settings as SettingsIcon, Trash2, ArrowLeft} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, useParams } from 'react-router-dom'

import { AssignmentCompletion } from '@/components/AssignmentCompletion'
import { AssignmentSettingsDialog } from '@/components/AssignmentSettingsDialog'
import { AttachmentList } from '@/components/AttachmentList'
import { Countdown } from '@/components/Countdown'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  createTodo,
  deleteTodo,
  getAssignment,
  getModule,
  updateAssignment,
  updateTodo,
  uploadAssignmentAttachment,
  type Todo,
} from '@/lib/api'
import { examEndsAt } from '@/lib/exam'
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

function NewTodoForm({ assignmentId, onCreated }: { assignmentId: number; onCreated: () => void }) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    try {
      await createTodo(assignmentId, text.trim())
      setText('')
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a step…" className="flex-1" />
      <Button type="submit" size="sm" disabled={submitting}>
        Add
      </Button>
    </form>
  )
}

function TodoRow({ assignmentId, todo, onChanged }: { assignmentId: number; todo: Todo; onChanged: () => void }) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <Checkbox
        checked={todo.done}
        onCheckedChange={async (checked) => {
          await updateTodo(assignmentId, todo.id, { done: checked === true })
          onChanged()
        }}
      />
      <span className={`flex-1 text-sm ${todo.done ? 'text-muted-foreground line-through' : ''}`}>{todo.text}</span>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Delete step"
        onClick={async () => {
          await deleteTodo(assignmentId, todo.id)
          onChanged()
        }}
      >
        <Trash2 />
      </Button>
    </li>
  )
}

export function AssignmentPage() {
  const { moduleId, assignmentId } = useParams()
  const id = Number(assignmentId)
  const [reloadKey, setReloadKey] = useState(0)
  const refetch = () => setReloadKey((k) => k + 1)

  const { data: assignment, loading, error } = useAsync(() => getAssignment(id), [id, reloadKey])
  const { data: module } = useAsync(() => getModule(Number(moduleId)), [moduleId])

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [notes, setNotes] = useState('')

  if (loading) {
    return (
      <div className="space-y-4 px-8 py-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error || !assignment) {
    return (
      <div className="space-y-4 px-8 py-8">
        <Link to={`/modules/${moduleId}`} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Module
        </Link>
        <p className="text-sm text-destructive">This assignment couldn't be found.</p>
      </div>
    )
  }

  const overdue =
    assignment.status !== 'graded' && assignment.due_at !== null && new Date(assignment.due_at) < new Date()
  const isExam = assignment.kind === 'exam'

  function startEditingNotes() {
    setNotes(assignment!.notes_markdown)
    setEditingNotes(true)
  }

  async function saveNotes() {
    setSavingNotes(true)
    try {
      await updateAssignment(id, { notes_markdown: notes })
      setEditingNotes(false)
      refetch()
    } finally {
      setSavingNotes(false)
    }
  }

  return (
    <div className="min-h-full">
      <PageHeader
        left={
        <Link
          to={`/modules/${moduleId}`}
          aria-label={`Back to ${module?.name ?? "module"}`}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4 shrink-0" />
            <span className="truncate">{module?.name}</span>
        </Link>
        }
        right={
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon /> Settings
          </Button>
        }
      />

      <div className="border-b" style={{ backgroundColor: module ? `${module.color}1f` : undefined }}>
        <div className="flex items-center gap-6 px-8 py-12">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-4xl font-semibold">{assignment.title}</h1>
            <p className="mt-1 text-base text-muted-foreground">
              {module?.name}
              {module?.credits !== null && module?.credits !== undefined && ` · ${module.credits} credits`}
              {' · '}
              <span className={overdue ? 'font-medium text-destructive' : ''}>
                {!assignment.due_at
                  ? 'No due date'
                  : isExam
                    ? formatExamWhen(assignment.due_at, assignment.duration_minutes, assignment.location)
                    : `Due ${formatDate(assignment.due_at)}`}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-8 text-right">
            <div>
              <Countdown
                target={assignment.due_at}
                noneLabel="No due date"
                arrivedLabel={isExam ? 'Exam started' : 'Due now'}
              />
              <p className="mt-0.5 text-sm text-muted-foreground">{assignment.weight_percent}% of grade</p>
            </div>
            <AssignmentCompletion assignment={assignment} onChanged={refetch} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-8 py-10">
        {assignment.description && <p className="text-sm text-muted-foreground">{assignment.description}</p>}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Notes</h2>
            {!editingNotes && (
              <Button variant="outline" size="sm" onClick={startEditingNotes}>
                Edit
              </Button>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={10}
                className="font-mono text-sm"
                placeholder="Write in Markdown…"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveNotes} disabled={savingNotes}>
                  {savingNotes ? 'Saving…' : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : assignment.notes_markdown.trim() ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{assignment.notes_markdown}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          )}
        </section>

        {assignment.covered_submodules.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-medium">Covers</h2>
            <ul className="flex flex-wrap gap-2">
              {assignment.covered_submodules.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/modules/${moduleId}/submodules/${s.id}`}
                    className="inline-block rounded-lg border px-2.5 py-1 text-sm transition-colors hover:bg-muted"
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <AttachmentList
          title="Files"
          attachments={assignment.attachments}
          upload={(file) => uploadAssignmentAttachment(id, file)}
          onChanged={refetch}
        />

        <section className="space-y-2">
          <h2 className="text-lg font-medium">Checklist</h2>
          <NewTodoForm assignmentId={id} onCreated={refetch} />
          {assignment.todos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps yet.</p>
          ) : (
            <ul className="divide-y">
              {assignment.todos.map((todo) => (
                <TodoRow key={todo.id} assignmentId={id} todo={todo} onChanged={refetch} />
              ))}
            </ul>
          )}
        </section>
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
