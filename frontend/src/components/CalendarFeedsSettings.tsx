import { useRef, useState, type FormEvent } from 'react'

import { AlertTriangle, Link2, RefreshCw, Upload } from 'lucide-react'

import { ColorSwatchPicker } from '@/components/ColorSwatchPicker'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  createCalendarFeed,
  deleteCalendarFeed,
  listCalendarFeeds,
  listFeedSeries,
  listModules,
  refreshCalendarFeed,
  replaceCalendarFeedFile,
  setFeedLinks,
  updateCalendarFeed,
  uploadCalendarFeed,
  type CalendarFeed,
} from '@/lib/api'
import { formatSyncedAgo } from '@/lib/calendarFeeds'
import { MODULE_COLOR_SWATCHES } from '@/lib/colors'
import { useAsync } from '@/lib/useAsync'

const ICS_ACCEPT = '.ics,text/calendar'
/** Select value for "not linked"; Radix Select items can't have an empty value. */
const NOT_LINKED = 'none'

/** Just the host: the full address is a secret, so it isn't shown in the list. */
function feedHost(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

type Source = 'url' | 'file'

function CalendarFeedForm({
  feed,
  onSaved,
  onCancel,
}: {
  feed?: CalendarFeed
  onSaved: () => void
  onCancel: () => void
}) {
  const [source, setSource] = useState<Source>(feed?.source ?? 'url')
  const [name, setName] = useState(feed?.name ?? '')
  const [url, setUrl] = useState(feed?.url ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [color, setColor] = useState(feed?.color ?? MODULE_COLOR_SWATCHES[1])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Name is required')
    if (source === 'url' && !url.trim()) return setError('Paste the calendar address')
    if (source === 'file' && !feed && !file) return setError('Choose an .ics file')
    setSubmitting(true)
    setError(null)
    try {
      if (feed) {
        await updateCalendarFeed(feed.id, { name: name.trim(), color, ...(source === 'url' ? { url: url.trim() } : {}) })
      } else if (source === 'file' && file) {
        await uploadCalendarFeed({ name: name.trim(), color, file })
      } else {
        await createCalendarFeed({ name: name.trim(), url: url.trim(), color, enabled: true })
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'Could not save the calendar.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-muted/50 p-4">
      {!feed && (
        <div className="flex gap-1">
          {(['url', 'file'] as const).map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={source === s ? 'default' : 'outline'}
              aria-pressed={source === s}
              onClick={() => setSource(s)}
            >
              {s === 'url' ? 'Calendar link' : 'Upload .ics file'}
            </Button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="calendar-feed-name">Name</Label>
        <Input
          id="calendar-feed-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={source === 'file' ? 'University timetable' : 'Work'}
        />
      </div>

      {source === 'url' && (
        <div className="space-y-1.5">
          <Label htmlFor="calendar-feed-url">Calendar address</Label>
          <Input
            id="calendar-feed-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            In Google Calendar: Settings → your calendar → Integrate calendar → Secret address in iCal format. Any
            ICS or webcal link works.
          </p>
        </div>
      )}

      {source === 'file' && !feed && (
        <div className="space-y-1.5">
          <Label htmlFor="calendar-feed-file">Calendar file</Label>
          <Input
            id="calendar-feed-file"
            type="file"
            accept={ICS_ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            E.g. your university timetable download. After adding it, use Link to modules to turn its lectures into
            module lectures. Upload a newer file later with Replace file.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Colour</Label>
        <ColorSwatchPicker value={color} onChange={setColor} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Syncing…' : feed ? 'Save changes' : 'Add calendar'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** Map each event series (by title) to a module, whose lectures its events become, or leave it as busy time. */
function FeedLinksPanel({ feed, onSaved, onCancel }: { feed: CalendarFeed; onSaved: () => void; onCancel: () => void }) {
  const series = useAsync(() => listFeedSeries(feed.id), [feed.id])
  const modules = useAsync(() => listModules(), [])
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const moduleList = modules.data ?? []
  const choiceFor = (title: string, linked: number | null) => choices[title] ?? (linked === null ? NOT_LINKED : String(linked))

  async function handleSave() {
    if (!series.data) return
    setSaving(true)
    setError(null)
    try {
      await setFeedLinks(
        feed.id,
        series.data.map((s) => {
          const choice = choiceFor(s.title, s.module_id)
          return { title: s.title, module_id: choice === NOT_LINKED ? null : Number(choice) }
        }),
      )
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'Could not save the links.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl bg-muted/50 p-4">
      <div>
        <p className="text-sm font-medium">Link to modules</p>
        <p className="text-xs text-muted-foreground">
          Events with the same title form a series. A linked series becomes that module's lectures and stays in sync
          with this calendar; the rest stay busy time.
        </p>
      </div>

      {(series.loading || modules.loading) && <Skeleton className="h-20 w-full" />}
      {(series.error || modules.error) && <p className="text-sm text-destructive">Couldn't load the calendar's events.</p>}
      {series.data?.length === 0 && <p className="text-sm text-muted-foreground">No timed events in this calendar.</p>}
      {series.data && series.data.length > 0 && modules.data && (
        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {series.data.map((s) => (
            <li key={s.title} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.count} × from {formatDay(s.first_starts_at)}
                  {s.location && ` · ${s.location}`}
                </p>
              </div>
              <Select
                value={choiceFor(s.title, s.module_id)}
                onValueChange={(v) => setChoices((c) => ({ ...c, [s.title]: v }))}
              >
                <SelectTrigger className="w-44 shrink-0" aria-label={`Module for ${s.title}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_LINKED}>Not linked (busy)</SelectItem>
                  {moduleList.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving || !series.data?.length}>
          {saving ? 'Saving…' : 'Save links'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function CalendarFeedItem({ feed, onChanged }: { feed: CalendarFeed; onChanged: () => void }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'links'>('view')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const isFile = feed.source === 'file'

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong.'))
    } finally {
      setBusy(false)
      onChanged()
    }
  }

  async function handleDelete() {
    const lectures = feed.linked_lecture_count
    const extra = lectures ? ` Its ${lectures} linked ${lectures === 1 ? 'lecture' : 'lectures'} go too.` : ''
    if (!confirm(`Remove "${feed.name}"? Its events leave the calendar.${extra}`)) return
    await deleteCalendarFeed(feed.id)
    onChanged()
  }

  if (mode === 'edit') {
    return (
      <li className="py-2">
        <CalendarFeedForm
          feed={feed}
          onSaved={() => {
            setMode('view')
            onChanged()
          }}
          onCancel={() => setMode('view')}
        />
      </li>
    )
  }

  const synced = `${isFile ? 'Last updated' : 'Last synced'} ${formatSyncedAgo(feed.last_synced_at)}`
  const counts = [
    feed.linked_lecture_count > 0 &&
      `${feed.linked_lecture_count} ${feed.linked_lecture_count === 1 ? 'lecture' : 'lectures'}`,
    `${feed.event_count} busy ${feed.event_count === 1 ? 'event' : 'events'}`,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className="space-y-2 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Checkbox
            checked={feed.enabled}
            onCheckedChange={(checked) => run(() => updateCalendarFeed(feed.id, { enabled: checked === true }))}
            aria-label={feed.enabled ? `Hide ${feed.name}'s busy time` : `Show ${feed.name}'s busy time`}
            className="mt-1"
          />
          <div className={`min-w-0 ${feed.enabled ? '' : 'opacity-60'}`}>
            <p className="flex items-center gap-2 font-medium">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: feed.color }} aria-hidden />
              <span className="truncate">{feed.name}</span>
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {isFile || !feed.url ? 'Uploaded file' : feedHost(feed.url)} &middot; {counts}
            </p>
            <p className="text-xs text-muted-foreground">{synced}</p>
            {feed.last_error && (
              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  {feed.last_error}.{' '}
                  {feed.last_synced_at ? 'Showing the last synced copy.' : 'Nothing synced yet.'}
                </span>
              </p>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {isFile ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={ICS_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void run(() => replaceCalendarFeedFile(feed.id, file))
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
                title="Replace file"
              >
                <Upload className="size-4" />
                <span className="sr-only">Replace file</span>
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => run(() => refreshCalendarFeed(feed.id))} disabled={busy} title="Sync now">
              <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />
              <span className="sr-only">Refresh</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMode(mode === 'links' ? 'view' : 'links')}
            aria-pressed={mode === 'links'}
            title="Link to modules"
          >
            <Link2 className="size-4" />
            <span className="sr-only">Link to modules</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode('edit')}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>
      {mode === 'links' && (
        <FeedLinksPanel
          feed={feed}
          onSaved={() => {
            setMode('view')
            onChanged()
          }}
          onCancel={() => setMode('view')}
        />
      )}
    </li>
  )
}

/** Settings → Calendars: subscribed calendars (Google Calendar links or uploaded .ics files). */
export function CalendarFeedsSettings({ onChanged }: { onChanged: () => void }) {
  const [adding, setAdding] = useState(false)
  const { data: feeds, loading, error, refetch: refetchFeeds } = useAsync(() => listCalendarFeeds(), [])

  function refetch() {
    void refetchFeeds()
    onChanged()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Calendar feeds</h3>
          <p className="text-xs text-muted-foreground">
            Add a Google Calendar link or upload an .ics file (e.g. a university timetable). Events show as busy time
            and block revision planning (all-day ones only show), or link a series to a module to make it lectures.
          </p>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="shrink-0">
            Add calendar
          </Button>
        )}
      </div>

      {adding && (
        <CalendarFeedForm
          onSaved={() => {
            setAdding(false)
            refetch()
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {loading && <Skeleton className="h-16 w-full" />}
      {error && <p className="text-sm text-destructive">Couldn't load calendar feeds.</p>}
      {feeds?.length === 0 && !adding && <p className="text-sm text-muted-foreground">No calendar feeds yet.</p>}
      {feeds && feeds.length > 0 && (
        <ul className="divide-y">
          {feeds.map((feed) => (
            <CalendarFeedItem key={feed.id} feed={feed} onChanged={refetch} />
          ))}
        </ul>
      )}
    </div>
  )
}
