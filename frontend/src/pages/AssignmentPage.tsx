import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AttachmentList } from '@/components/AttachmentList'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  ASSIGNMENT_STATUS_LABEL,
  createTodo,
  deleteAssignment,
  deleteTodo,
  getAssignment,
  toNaiveDateTime,
  updateAssignment,
  updateTodo,
  uploadAssignmentAttachment,
  type AssignmentStatus,
  type Todo,
} from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

const SELECT_CLASS =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function toLocalInput(iso: string) {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
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
  const navigate = useNavigate()
  const id = Number(assignmentId)
  const [reloadKey, setReloadKey] = useState(0)
  const refetch = () => setReloadKey((k) => k + 1)

  const { data: assignment, loading, error } = useAsync(() => getAssignment(id), [id, reloadKey])

  const [editingSettings, setEditingSettings] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [weight, setWeight] = useState('')
  const [status, setStatus] = useState<AssignmentStatus>('not_started')
  const [gradeEarned, setGradeEarned] = useState('')
  const [gradeMax, setGradeMax] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-8 py-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error || !assignment) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-8 py-8">
        <Link to={`/modules/${moduleId}`} className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Module
        </Link>
        <p className="text-sm text-destructive">This assignment couldn't be found.</p>
      </div>
    )
  }

  const overdue =
    assignment.status !== 'graded' && assignment.due_at !== null && new Date(assignment.due_at) < new Date()

  function startEditingSettings() {
    setTitle(assignment!.title)
    setDueAt(assignment!.due_at ? toLocalInput(assignment!.due_at) : '')
    setWeight(String(assignment!.weight_percent))
    setStatus(assignment!.status)
    setGradeEarned(assignment!.grade_earned !== null ? String(assignment!.grade_earned) : '')
    setGradeMax(assignment!.grade_max !== null ? String(assignment!.grade_max) : '')
    setDescription(assignment!.description ?? '')
    setSettingsError(null)
    setEditingSettings(true)
  }

  async function saveSettings() {
    const weightValue = Number(weight)
    if (!title.trim() || !weight || weightValue <= 0 || weightValue > 100) {
      setSettingsError('Title and a weighting between 0 and 100 are required.')
      return
    }
    setSavingSettings(true)
    setSettingsError(null)
    try {
      await updateAssignment(id, {
        title: title.trim(),
        due_at: dueAt ? toNaiveDateTime(new Date(dueAt)) : null,
        weight_percent: weightValue,
        status,
        grade_earned: gradeEarned ? Number(gradeEarned) : null,
        grade_max: gradeMax ? Number(gradeMax) : null,
        description: description.trim() || null,
      })
      setEditingSettings(false)
      refetch()
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setSavingSettings(false)
    }
  }

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

  async function handleDelete() {
    if (!confirm(`Delete "${assignment!.title}"? This removes its notes, files, and checklist.`)) return
    await deleteAssignment(id)
    navigate(`/modules/${moduleId}`)
  }

  return (
    <div className="min-h-full">
      <PageHeader
        left={
          <Link to={`/modules/${moduleId}`} className="text-sm text-muted-foreground hover:text-foreground">
            &larr; Module
          </Link>
        }
        right={
          <Button variant="ghost" size="sm" onClick={handleDelete}>
            Delete assignment
          </Button>
        }
      />

      <div className="mx-auto max-w-3xl space-y-8 px-8 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{assignment.title}</h1>
          <p className="text-sm text-muted-foreground">
            {assignment.due_at
              ? `Due ${new Date(assignment.due_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
              : 'No due date'}{' '}
            &middot; {assignment.weight_percent}% of grade
            {assignment.grade_earned !== null &&
              assignment.grade_max !== null &&
              ` · ${assignment.grade_earned}/${assignment.grade_max}`}
          </p>
        </div>
        <Badge variant={overdue ? 'destructive' : assignment.status === 'graded' ? 'secondary' : 'outline'}>
          {overdue ? 'Overdue' : ASSIGNMENT_STATUS_LABEL[assignment.status]}
        </Badge>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Settings</h2>
          {!editingSettings && (
            <Button variant="outline" size="sm" onClick={startEditingSettings}>
              Edit
            </Button>
          )}
        </div>

        {editingSettings ? (
          <div className="space-y-3 rounded-xl bg-muted/50 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="assignment-title">Title</Label>
              <Input id="assignment-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="assignment-due">Due date</Label>
                <Input id="assignment-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assignment-weight">Weighting (%)</Label>
                <Input
                  id="assignment-weight"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="assignment-status">Status</Label>
                <select
                  id="assignment-status"
                  className={SELECT_CLASS}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AssignmentStatus)}
                >
                  {Object.entries(ASSIGNMENT_STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assignment-grade-earned">Grade earned</Label>
                <Input
                  id="assignment-grade-earned"
                  type="number"
                  value={gradeEarned}
                  onChange={(e) => setGradeEarned(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assignment-grade-max">Out of</Label>
                <Input
                  id="assignment-grade-max"
                  type="number"
                  value={gradeMax}
                  onChange={(e) => setGradeMax(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assignment-description">Description</Label>
              <Textarea
                id="assignment-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {settingsError && <p className="text-sm text-destructive">{settingsError}</p>}

            <div className="flex gap-2">
              <Button size="sm" onClick={saveSettings} disabled={savingSettings}>
                {savingSettings ? 'Saving…' : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingSettings(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          assignment.description && <p className="text-sm text-muted-foreground">{assignment.description}</p>
        )}
      </section>

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
    </div>
  )
}
