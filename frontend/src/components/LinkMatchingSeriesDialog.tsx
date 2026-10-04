import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { linkFeedSeries, listAllFeedSeries, type CalendarSeries } from '@/lib/api'

const seriesKey = (s: CalendarSeries) => `${s.feed_id}\u0000${s.title}`

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/**
 * After a module's course code is saved (or a module is created with one), offers to turn the
 * unlinked calendar series whose titles start with that code into the module's lectures. A non-null
 * `moduleId` means "check now"; with no matches it closes without showing anything.
 */
export function LinkMatchingSeriesDialog({
  moduleId,
  code,
  onClose,
  onLinked,
}: {
  moduleId: number | null
  /** Shown in the title. */
  code: string | null
  onClose: () => void
  onLinked: () => void | Promise<void>
}) {
  const [matches, setMatches] = useState<CalendarSeries[] | null>(null)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (moduleId === null) return
    let cancelled = false
    listAllFeedSeries()
      .then((all) => {
        if (cancelled) return
        const found = all.filter((s) => s.module_id === null && s.suggested_module_id === moduleId)
        if (found.length === 0) {
          onClose()
          return
        }
        setMatches(found)
        setTicked(new Set(found.map(seriesKey)))
        setError(null)
      })
      // Nothing to offer if the calendars can't be read; the Lectures tab still suggests them later.
      .catch(() => !cancelled && onClose())
    return () => {
      cancelled = true
    }
    // Only a new module (or a new save) should re-check, not a new onClose identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, code])

  function close() {
    setMatches(null)
    onClose()
  }

  async function addAsLectures() {
    if (moduleId === null || !matches) return
    setSaving(true)
    setError(null)
    try {
      for (const s of matches.filter((m) => ticked.has(seriesKey(m)))) {
        await linkFeedSeries(s.feed_id, s.title, moduleId)
      }
      await onLinked()
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the lectures.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={moduleId !== null && matches !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Calendar events match {code}</DialogTitle>
          <DialogDescription>
            Add them as this module's lectures? They stay in sync with the calendar, and you can unlink them in
            Settings → Lectures.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {matches?.map((s) => {
            const key = seriesKey(s)
            return (
              <li key={key}>
                <label className="flex cursor-pointer items-start gap-2.5">
                  <Checkbox
                    className="mt-0.5"
                    checked={ticked.has(key)}
                    onCheckedChange={(checked) =>
                      setTicked((t) => {
                        const next = new Set(t)
                        if (checked === true) next.add(key)
                        else next.delete(key)
                        return next
                      })
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{s.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.count} × from {formatDay(s.first_starts_at)}
                      {s.location && ` · ${s.location}`} · {s.feed_name}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            Not now
          </Button>
          <Button size="sm" onClick={addAsLectures} disabled={saving || ticked.size === 0}>
            {saving ? 'Adding…' : 'Add as lectures'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
