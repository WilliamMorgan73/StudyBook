import { useEffect, useMemo, useRef, useState } from 'react'

import { calendarGridRange } from '@/components/MonthCalendar'
import { getCalendar, refreshStaleCalendarFeeds, updateRevisionSession } from '@/lib/api'
import { visibleCalendarEvents } from '@/lib/busyTime'
import { useAsync } from '@/lib/useAsync'
import { useSampleData } from '@/lib/sampleData'

const SHOW_BUSY_KEY = 'studybook.overview.showBusy'

function readShowBusy() {
  try {
    return localStorage.getItem(SHOW_BUSY_KEY) !== 'false'
  } catch {
    return true
  }
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** The selected calendar day's heading. */
export function selectedDayLabel(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

/**
 * The Overview calendar's state, shared by the Calendar widget (month grid) and the Day agenda
 * widget (the selected day's events), which can sit anywhere on the dashboard.
 */
export function useOverviewCalendar() {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selected, setSelected] = useState(() => new Date())
  const [expandedEventKey, setExpandedEventKey] = useState<string | null>(null)
  const [showBusy, setShowBusy] = useState(readShowBusy)

  function toggleShowBusy() {
    const next = !showBusy
    setShowBusy(next)
    try {
      localStorage.setItem(SHOW_BUSY_KEY, String(next))
    } catch {
      // Storage unavailable: the toggle still works for this visit.
    }
  }

  function selectDay(date: Date) {
    setSelected(date)
    setExpandedEventKey(null)
  }

  function toggleEvent(key: string) {
    setExpandedEventKey((current) => (current === key ? null : key))
  }

  const gridRange = useMemo(() => calendarGridRange(month), [month])
  // Keep the current month on screen until the next one loads, so paging doesn't blink.
  const sample = useSampleData()
  const calendar = useAsync(() => (sample ? Promise.resolve(sample.calendar) : getCalendar(gridRange.start, gridRange.end)), [gridRange], {
    keepPreviousData: true,
  })

  // Calendar feeds sync when the calendar is viewed, if over an hour old. The cached events show
  // meanwhile; refetch only when something actually synced. A failure keeps the cached copy.
  // The latest refetch, since the user may page to another month while the sync is in flight.
  const refetchRef = useRef(calendar.refetch)
  useEffect(() => {
    refetchRef.current = calendar.refetch
  }, [calendar.refetch])
  useEffect(() => {
    if (sample) return // a preview: nothing to sync
    let cancelled = false
    refreshStaleCalendarFeeds()
      .then(({ refreshed }) => {
        if (!cancelled && refreshed > 0) void refetchRef.current()
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [sample])

  async function setRevisionDone(sessionId: number, done: boolean) {
    await updateRevisionSession(sessionId, { done })
    await calendar.refetch()
  }

  const events = useMemo(() => visibleCalendarEvents(calendar.data ?? [], showBusy), [calendar.data, showBusy])
  const selectedDayEvents = useMemo(
    () => events.filter((e) => isSameDay(new Date(e.starts_at), selected)),
    [events, selected],
  )

  return {
    month,
    setMonth,
    selected,
    selectDay,
    expandedEventKey,
    toggleEvent,
    showBusy,
    toggleShowBusy,
    calendar,
    events,
    selectedDayEvents,
    setRevisionDone,
  }
}

export type OverviewCalendar = ReturnType<typeof useOverviewCalendar>
