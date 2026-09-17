import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  createLecture,
  deleteLecture,
  getModule,
  listLectures,
  updateLecture,
  type Lecture,
} from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

function toLocalInput(iso: string) {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

type Repeat = 'none' | 'weekly' | 'fortnightly'

const SELECT_CLASS =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function NewLectureForm({ moduleId, onCreated }: { moduleId: number; onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [location, setLocation] = useState('')
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [occurrences, setOccurrences] = useState('10')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !scheduledAt) {
      setError('A title and date/time are required.')
      return
    }
    const intervalDays = repeat === 'weekly' ? 7 : repeat === 'fortnightly' ? 14 : 0
    const count = repeat === 'none' ? 1 : Math.min(52, Math.max(1, Number(occurrences) || 1))

    setSubmitting(true)
    setError(null)
    try {
      const base = new Date(scheduledAt)
      for (let i = 0; i < count; i++) {
        const occurrence = new Date(base)
        occurrence.setDate(occurrence.getDate() + i * intervalDays)
        await createLecture({
          module_id: moduleId,
          title: title.trim(),
          scheduled_at: occurrence.toISOString(),
          location: location.trim() || null,
          week_number: repeat === 'none' ? null : i + 1,
        })
      }
      setTitle('')
      setScheduledAt('')
      setLocation('')
      setRepeat('none')
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the lecture.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-xl bg-muted/50 p-4">
      <div className="min-w-40 flex-1 space-y-1.5">
        <Label htmlFor="new-lecture-title">Title</Label>
        <Input id="new-lecture-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Week 4 lecture" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-lecture-when">Date &amp; time</Label>
        <Input
          id="new-lecture-when"
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
      </div>
      <div className="min-w-32 space-y-1.5">
        <Label htmlFor="new-lecture-location">Location</Label>
        <Input id="new-lecture-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room 204" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-lecture-repeat">Repeats</Label>
        <select
          id="new-lecture-repeat"
          className={SELECT_CLASS}
          value={repeat}
          onChange={(e) => setRepeat(e.target.value as Repeat)}
        >
          <option value="none">Does not repeat</option>
          <option value="weekly">Weekly</option>
          <option value="fortnightly">Fortnightly</option>
        </select>
      </div>
      {repeat !== 'none' && (
        <div className="w-28 space-y-1.5">
          <Label htmlFor="new-lecture-occurrences">Occurrences</Label>
          <Input
            id="new-lecture-occurrences"
            type="number"
            min={1}
            max={52}
            value={occurrences}
            onChange={(e) => setOccurrences(e.target.value)}
          />
        </div>
      )}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add lecture'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  )
}

function LectureRow({ lecture, onChanged }: { lecture: Lecture; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(lecture.title)
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(lecture.scheduled_at))
  const [location, setLocation] = useState(lecture.location ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!title.trim() || !scheduledAt) {
      setError('A title and date/time are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateLecture(lecture.id, {
        title: title.trim(),
        scheduled_at: new Date(scheduledAt).toISOString(),
        location: location.trim() || null,
      })
      setEditing(false)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete "${lecture.title}"?`)) return
    await deleteLecture(lecture.id)
    onChanged()
  }

  if (editing) {
    return (
      <li className="space-y-2 rounded-xl border py-3">
        <div className="flex flex-wrap items-end gap-3 px-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-40 flex-1" />
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location"
            className="min-w-32"
          />
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
        {error && <p className="px-3 text-sm text-destructive">{error}</p>}
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-medium">{lecture.title}</p>
        <p className="text-sm text-muted-foreground">
          {new Date(lecture.scheduled_at).toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
          {lecture.location && ` — ${lecture.location}`}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={remove}>
          Delete
        </Button>
      </div>
    </li>
  )
}

export function ModuleSettingsPage() {
  const { moduleId } = useParams()
  const id = Number(moduleId)
  const [reloadKey, setReloadKey] = useState(0)
  const refetch = () => setReloadKey((k) => k + 1)

  const { data: module } = useAsync(() => getModule(id), [id])
  const { data: lectures, loading } = useAsync(() => listLectures(id), [id, reloadKey])

  const sorted = [...(lectures ?? [])].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  )

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <Link to={`/modules/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
        &larr; {module?.name ?? 'Module'}
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage when this module's lectures occur.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Lectures</h2>
        <NewLectureForm moduleId={id} onCreated={refetch} />
        {loading && <Skeleton className="h-24 w-full" />}
        {sorted.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">No lectures scheduled yet.</p>
        )}
        {sorted.length > 0 && (
          <ul className="divide-y">
            {sorted.map((lecture) => (
              <LectureRow key={lecture.id} lecture={lecture} onChanged={refetch} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
