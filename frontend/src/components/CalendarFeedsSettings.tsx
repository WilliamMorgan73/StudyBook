import { useState, type FormEvent } from 'react'

import { AlertTriangle, RefreshCw } from 'lucide-react'

import { ColorSwatchPicker } from '@/components/ColorSwatchPicker'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  createCalendarFeed,
  deleteCalendarFeed,
  listCalendarFeeds,
  refreshCalendarFeed,
  updateCalendarFeed,
  type CalendarFeed,
} from '@/lib/api'
import { formatSyncedAgo } from '@/lib/calendarFeeds'
import { MODULE_COLOR_SWATCHES } from '@/lib/colors'
import { useAsync } from '@/lib/useAsync'

/** Just the host: the full address is a secret, so it isn't shown in the list. */
function feedHost(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function CalendarFeedForm({
  feed,
  onSaved,
  onCancel,
}: {
  feed?: CalendarFeed
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(feed?.name ?? '')
  const [url, setUrl] = useState(feed?.url ?? '')
  const [color, setColor] = useState(feed?.color ?? MODULE_COLOR_SWATCHES[1])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Name is required')
    if (!url.trim()) return setError('Paste the calendar address')
    setSubmitting(true)
    setError(null)
    try {
      const input = { name: name.trim(), url: url.trim(), color }
      if (feed) await updateCalendarFeed(feed.id, input)
      else await createCalendarFeed({ ...input, enabled: true })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the calendar.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-muted/50 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="calendar-feed-name">Name</Label>
        <Input id="calendar-feed-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Work" />
      </div>

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

function CalendarFeedItem({ feed, onChanged }: { feed: CalendarFeed; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await refreshCalendarFeed(feed.id)
    } finally {
      setRefreshing(false)
      onChanged()
    }
  }

  async function handleToggle(enabled: boolean) {
    await updateCalendarFeed(feed.id, { enabled })
    onChanged()
  }

  async function handleDelete() {
    if (!confirm(`Remove "${feed.name}"? Its events leave the calendar.`)) return
    await deleteCalendarFeed(feed.id)
    onChanged()
  }

  if (editing) {
    return (
      <li className="py-2">
        <CalendarFeedForm
          feed={feed}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  }

  const synced = `Last synced ${formatSyncedAgo(feed.last_synced_at)}`
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-start gap-3">
        <Checkbox
          checked={feed.enabled}
          onCheckedChange={(checked) => handleToggle(checked === true)}
          aria-label={feed.enabled ? `Hide ${feed.name}` : `Show ${feed.name}`}
          className="mt-1"
        />
        <div className={`min-w-0 ${feed.enabled ? '' : 'opacity-60'}`}>
          <p className="flex items-center gap-2 font-medium">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: feed.color }} aria-hidden />
            <span className="truncate">{feed.name}</span>
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {feedHost(feed.url)} &middot; {feed.event_count} {feed.event_count === 1 ? 'event' : 'events'} &middot;{' '}
            {synced}
          </p>
          {feed.last_error && (
            <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                {feed.last_error}.{' '}
                {feed.last_synced_at ? 'Showing the last synced copy.' : 'Nothing synced yet.'}
              </span>
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={refreshing} title="Sync now">
          <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="sr-only">Refresh</span>
        </Button>
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

/** Settings → Calendars: subscribed ICS calendars (e.g. Google Calendar) that count as busy time. */
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
            Subscribe to a Google Calendar (or any ICS link). Its events show as busy time and block revision
            planning; all-day events only show. Syncs when the calendar is viewed, at most hourly.
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
