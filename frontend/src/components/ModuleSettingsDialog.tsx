import { CalendarClock, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { ColorSwatchPicker } from '@/components/ColorSwatchPicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  createLecture,
  deleteLecture,
  deleteModule,
  getAppSettings,
  listLectures,
  listModules,
  toNaiveDateTime,
  updateModule,
  type ModuleDetail,
} from '@/lib/api'
import { groupLectures, type LectureGroup } from '@/lib/lectureSchedule'
import { useAsync } from '@/lib/useAsync'

type Category = 'general' | 'lectures'

const CATEGORIES: { id: Category; label: string; icon: typeof SlidersHorizontal }[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'lectures', label: 'Lectures', icon: CalendarClock },
]

type Repeat = 'none' | 'weekly' | 'fortnightly'

const SELECT_CLASS =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

const pad = (n: number) => String(n).padStart(2, '0')

function dateValue(iso: string | Date) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function timeValue(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysBetween(startStr: string, endStr: string) {
  const start = new Date(`${startStr}T00:00`).getTime()
  const end = new Date(`${endStr}T00:00`).getTime()
  return Math.round((end - start) / 86_400_000)
}

function addMinutesToTime(time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number)
  const total = ((h * 60 + m + minutes) % (24 * 60) + 24 * 60) % (24 * 60)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

function minutesBetween(startTime: string, endTime: string) {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const diff = eh * 60 + em - (sh * 60 + sm)
  return diff > 0 ? diff : null
}

function seriesKey(group: LectureGroup) {
  return group.type === 'series' ? `${group.series.title}-${group.series.firstDate}` : `lecture-${group.lecture.id}`
}

function initialStateFromGroup(group: LectureGroup | undefined) {
  if (!group) {
    const today = dateValue(new Date())
    return {
      title: '',
      location: '',
      startDate: today,
      startTime: '',
      endTime: '',
      duration: '',
      repeat: 'none' as Repeat,
      endDate: today,
      occurrences: '10',
    }
  }
  if (group.type === 'single') {
    const l = group.lecture
    const startTime = timeValue(l.scheduled_at)
    return {
      title: l.title,
      location: l.location ?? '',
      startDate: dateValue(l.scheduled_at),
      startTime,
      endTime: l.duration_minutes ? addMinutesToTime(startTime, l.duration_minutes) : '',
      duration: l.duration_minutes ? String(l.duration_minutes) : '',
      repeat: 'none' as Repeat,
      endDate: dateValue(l.scheduled_at),
      occurrences: '1',
    }
  }
  const s = group.series
  const startTime = timeValue(s.firstDate)
  const firstLecture = s.lectures[0]
  return {
    title: s.title,
    location: s.location ?? '',
    startDate: dateValue(s.firstDate),
    startTime,
    endTime: firstLecture.duration_minutes ? addMinutesToTime(startTime, firstLecture.duration_minutes) : '',
    duration: firstLecture.duration_minutes ? String(firstLecture.duration_minutes) : '',
    repeat: (s.intervalDays === 7 ? 'weekly' : 'fortnightly') as Repeat,
    endDate: dateValue(s.lastDate),
    occurrences: String(s.lectures.length),
  }
}

function LectureSeriesForm({
  moduleId,
  group,
  onSaved,
  onCancel,
}: {
  moduleId: number
  group?: LectureGroup
  onSaved: () => void
  onCancel: () => void
}) {
  const initial = initialStateFromGroup(group)
  const [title, setTitle] = useState(initial.title)
  const [location, setLocation] = useState(initial.location)
  const [startDate, setStartDate] = useState(initial.startDate)
  const [startTime, setStartTime] = useState(initial.startTime)
  const [endTime, setEndTime] = useState(initial.endTime)
  const [duration, setDuration] = useState(initial.duration)
  const [repeat, setRepeat] = useState<Repeat>(initial.repeat)
  const [endDate, setEndDate] = useState(initial.endDate)
  const [occurrences, setOccurrences] = useState(initial.occurrences)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const intervalDays = repeat === 'weekly' ? 7 : repeat === 'fortnightly' ? 14 : 0

  function handleRepeatChange(next: Repeat) {
    setRepeat(next)
    const interval = next === 'weekly' ? 7 : next === 'fortnightly' ? 14 : 0
    if (interval > 0 && startDate) {
      const count = Math.max(1, Number(occurrences) || 1)
      setEndDate(addDays(startDate, (count - 1) * interval))
    }
  }

  function handleStartDateChange(value: string) {
    setStartDate(value)
    if (intervalDays > 0 && value) {
      const count = Math.max(1, Number(occurrences) || 1)
      setEndDate(addDays(value, (count - 1) * intervalDays))
    }
  }

  function handleEndDateChange(value: string) {
    setEndDate(value)
    if (intervalDays > 0 && startDate && value) {
      const count = Math.max(1, Math.floor(daysBetween(startDate, value) / intervalDays) + 1)
      setOccurrences(String(count))
    }
  }

  function handleOccurrencesChange(value: string) {
    setOccurrences(value)
    const count = Math.max(1, Number(value) || 1)
    if (intervalDays > 0 && startDate) {
      setEndDate(addDays(startDate, (count - 1) * intervalDays))
    }
  }

  function handleStartTimeChange(value: string) {
    setStartTime(value)
    if (duration && value) {
      setEndTime(addMinutesToTime(value, Number(duration) || 0))
    }
  }

  function handleEndTimeChange(value: string) {
    setEndTime(value)
    if (startTime && value) {
      const minutes = minutesBetween(startTime, value)
      if (minutes !== null) setDuration(String(minutes))
    }
  }

  function handleDurationChange(value: string) {
    setDuration(value)
    if (startTime && value) {
      setEndTime(addMinutesToTime(startTime, Number(value) || 0))
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !startDate || !startTime) {
      setError('Title, start date, and start time are required.')
      return
    }
    const count = repeat === 'none' ? 1 : Math.min(52, Math.max(1, Number(occurrences) || 1))
    const durationMinutes = duration ? Number(duration) || null : null

    setSubmitting(true)
    setError(null)
    try {
      if (group) {
        const existing = group.type === 'series' ? group.series.lectures : [group.lecture]
        for (const lecture of existing) {
          await deleteLecture(lecture.id)
        }
      }
      for (let i = 0; i < count; i++) {
        const occurrenceDate = intervalDays > 0 ? addDays(startDate, i * intervalDays) : startDate
        await createLecture({
          module_id: moduleId,
          title: title.trim(),
          scheduled_at: toNaiveDateTime(new Date(`${occurrenceDate}T${startTime}`)),
          duration_minutes: durationMinutes,
          location: location.trim() || null,
          week_number: repeat === 'none' ? null : i + 1,
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the lecture schedule.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-muted/50 p-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="series-title">Title</Label>
          <Input id="series-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lecture" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="series-location">Location</Label>
          <Input
            id="series-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Room 204"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="series-repeat">Repeats</Label>
          <select
            id="series-repeat"
            className={SELECT_CLASS}
            value={repeat}
            onChange={(e) => handleRepeatChange(e.target.value as Repeat)}
          >
            <option value="none">Does not repeat</option>
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="series-start-date">Start date</Label>
          <Input
            id="series-start-date"
            type="date"
            value={startDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="series-end-date">End date</Label>
          <Input
            id="series-end-date"
            type="date"
            value={endDate}
            disabled={repeat === 'none'}
            onChange={(e) => handleEndDateChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="series-occurrences">Occurrences</Label>
          <Input
            id="series-occurrences"
            type="number"
            min={1}
            max={52}
            value={occurrences}
            disabled={repeat === 'none'}
            onChange={(e) => handleOccurrencesChange(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="series-start-time">Start time</Label>
          <Input
            id="series-start-time"
            type="time"
            value={startTime}
            onChange={(e) => handleStartTimeChange(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="series-end-time">End time</Label>
          <Input id="series-end-time" type="time" value={endTime} onChange={(e) => handleEndTimeChange(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="series-duration">Duration (min)</Label>
          <Input
            id="series-duration"
            type="number"
            min={0}
            value={duration}
            onChange={(e) => handleDurationChange(e.target.value)}
            placeholder="50"
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Saving…' : group ? 'Save changes' : 'Add lecture time'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function LectureSeriesCard({
  moduleId,
  group,
  onChanged,
}: {
  moduleId: number
  group: LectureGroup
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)

  async function handleDelete() {
    const lectures = group.type === 'series' ? group.series.lectures : [group.lecture]
    if (!confirm(`Delete ${lectures.length > 1 ? `this lecture series (${lectures.length} lectures)` : 'this lecture'}?`))
      return
    for (const lecture of lectures) {
      await deleteLecture(lecture.id)
    }
    onChanged()
  }

  if (editing) {
    return (
      <li className="py-2">
        <LectureSeriesForm
          moduleId={moduleId}
          group={group}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  }

  const summary =
    group.type === 'single' ? (
      <p className="text-sm text-muted-foreground">
        {new Date(group.lecture.scheduled_at).toLocaleString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
        {group.lecture.location && ` — ${group.lecture.location}`}
      </p>
    ) : (
      <p className="text-sm text-muted-foreground">
        {group.series.intervalDays === 7 ? `Every ${group.series.weekday}` : `Every other ${group.series.weekday}`} at{' '}
        {group.series.time}, until{' '}
        {new Date(group.series.lastDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        {group.series.location && ` — ${group.series.location}`} &middot; {group.series.lectures.length} lectures
      </p>
    )

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-medium">{group.type === 'single' ? group.lecture.title : group.series.title}</p>
        {summary}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDelete}>
          Delete
        </Button>
      </div>
    </li>
  )
}

export function ModuleSettingsDialog({
  module,
  open,
  onOpenChange,
  onChanged,
}: {
  module: ModuleDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const navigate = useNavigate()
  const [category, setCategory] = useState<Category>('general')
  const [reloadKey, setReloadKey] = useState(0)
  const [addingNew, setAddingNew] = useState(false)
  const refetchLectures = () => setReloadKey((k) => k + 1)

  const { data: lectures, loading } = useAsync(() => listLectures(module.id), [module.id, reloadKey])
  const groups = groupLectures(lectures ?? [])

  const { data: appSettings } = useAsync(() => getAppSettings(), [])
  const { data: allModules } = useAsync(() => listModules(), [reloadKey])
  const maxCredits = appSettings?.max_credits ?? null
  const otherCredits = (allModules ?? [])
    .filter((m) => m.id !== module.id)
    .reduce((sum, m) => sum + (m.credits ?? 0), 0)

  const [name, setName] = useState(module.name)
  const [code, setCode] = useState(module.code ?? '')
  const [credits, setCredits] = useState(module.credits !== null ? String(module.credits) : '')
  const [color, setColor] = useState(module.color)
  const [savingIdentity, setSavingIdentity] = useState(false)
  const [identityError, setIdentityError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCategory('general')
      setName(module.name)
      setCode(module.code ?? '')
      setCredits(module.credits !== null ? String(module.credits) : '')
      setColor(module.color)
      setIdentityError(null)
      setAddingNew(false)
    }
  }, [open, module.name, module.code, module.credits, module.color])

  async function saveIdentity() {
    if (!name.trim()) {
      setIdentityError('Give the module a name.')
      return
    }
    const creditsValue = credits ? Number(credits) : null
    if (creditsValue !== null && maxCredits !== null && otherCredits + creditsValue > maxCredits) {
      setIdentityError(
        `That's ${otherCredits + creditsValue} credits total, over your ${maxCredits}-credit max (${maxCredits - otherCredits} left for this module).`,
      )
      return
    }
    setSavingIdentity(true)
    setIdentityError(null)
    try {
      await updateModule(module.id, { name: name.trim(), code: code.trim() || null, credits: creditsValue, color })
      onChanged()
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setSavingIdentity(false)
    }
  }

  async function handleDeleteModule() {
    if (!confirm(`Delete "${module.name}"? This removes all its lectures, assignments, submodules, and flashcards.`))
      return
    await deleteModule(module.id)
    navigate('/')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Module settings</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-[26rem]">
          <nav className="w-44 shrink-0 space-y-0.5 border-r bg-muted/30 p-2">
            {CATEGORIES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  category === id
                    ? 'bg-background font-medium shadow-sm'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          <div className="max-h-[70vh] flex-1 overflow-y-auto p-5">
            {category === 'general' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="module-name">Name</Label>
                  <Input id="module-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="module-code">Course code</Label>
                    <Input id="module-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS201" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="module-credits">Credits</Label>
                    <Input
                      id="module-credits"
                      type="number"
                      min={0}
                      value={credits}
                      onChange={(e) => setCredits(e.target.value)}
                      placeholder="4"
                    />
                  </div>
                </div>
                {maxCredits !== null && (
                  <p className="-mt-2 text-xs text-muted-foreground">
                    {otherCredits} of {maxCredits} max credits used by your other modules.
                  </p>
                )}

                <div className="space-y-1.5">
                  <Label>Color</Label>
                  <ColorSwatchPicker value={color} onChange={setColor} />
                </div>

                {identityError && <p className="text-sm text-destructive">{identityError}</p>}

                <div className="flex items-center justify-between pt-1">
                  <Button size="sm" onClick={saveIdentity} disabled={savingIdentity}>
                    {savingIdentity ? 'Saving…' : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleDeleteModule}>
                    Delete module
                  </Button>
                </div>
              </div>
            )}

            {category === 'lectures' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Lectures</h3>
                  {!addingNew && (
                    <Button size="sm" variant="outline" onClick={() => setAddingNew(true)}>
                      Add a lecture time
                    </Button>
                  )}
                </div>

                {addingNew && (
                  <LectureSeriesForm
                    moduleId={module.id}
                    onSaved={() => {
                      setAddingNew(false)
                      refetchLectures()
                    }}
                    onCancel={() => setAddingNew(false)}
                  />
                )}

                {loading && <Skeleton className="h-24 w-full" />}
                {groups.length === 0 && !loading && !addingNew && (
                  <p className="text-sm text-muted-foreground">No lectures scheduled yet.</p>
                )}
                {groups.length > 0 && (
                  <ul className="divide-y">
                    {groups.map((group) => (
                      <LectureSeriesCard
                        key={seriesKey(group)}
                        moduleId={module.id}
                        group={group}
                        onChanged={refetchLectures}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
