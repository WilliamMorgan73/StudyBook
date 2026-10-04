import type { Lecture } from '@/lib/api'

const pad = (n: number) => String(n).padStart(2, '0')

export function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysBetween(startStr: string, endStr: string) {
  const start = new Date(`${startStr}T00:00`).getTime()
  const end = new Date(`${endStr}T00:00`).getTime()
  return Math.round((end - start) / 86_400_000)
}

export function addMinutesToTime(time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number)
  const total = (((h * 60 + m + minutes) % (24 * 60)) + 24 * 60) % (24 * 60)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

function minutesBetween(startTime: string, endTime: string) {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const diff = eh * 60 + em - (sh * 60 + sm)
  return diff > 0 ? diff : null
}

export interface DateSeriesState {
  startDate: string
  endDate: string
  occurrences: string
}

/**
 * The lecture-series scheduling form's date triad: start date, end date, and occurrence count
 * are tied together by `intervalDays` (0 when the series doesn't repeat, in which case editing
 * one field never touches the other two). Editing any one field recomputes exactly one sibling,
 * mirroring the constraint the form always upholds: start + interval * (count - 1) = end.
 */
export function nextDateSeriesState(
  state: DateSeriesState,
  changed: 'startDate' | 'endDate' | 'occurrences',
  value: string,
  intervalDays: number,
): DateSeriesState {
  if (changed === 'startDate') {
    if (intervalDays <= 0 || !value) return { ...state, startDate: value }
    const count = Math.max(1, Number(state.occurrences) || 1)
    return { ...state, startDate: value, endDate: addDays(value, (count - 1) * intervalDays) }
  }

  if (changed === 'endDate') {
    if (intervalDays <= 0 || !state.startDate || !value) return { ...state, endDate: value }
    const count = Math.max(1, Math.floor(daysBetween(state.startDate, value) / intervalDays) + 1)
    return { ...state, endDate: value, occurrences: String(count) }
  }

  if (intervalDays <= 0 || !state.startDate) return { ...state, occurrences: value }
  const count = Math.max(1, Number(value) || 1)
  return { ...state, occurrences: value, endDate: addDays(state.startDate, (count - 1) * intervalDays) }
}

export interface TimeRangeState {
  startTime: string
  endTime: string
  duration: string
}

/** The lecture-series scheduling form's time triad: start time, end time, and duration (minutes)
 * are tied together directly — editing any one field recomputes exactly one sibling. */
export function nextTimeRangeState(
  state: TimeRangeState,
  changed: 'startTime' | 'endTime' | 'duration',
  value: string,
): TimeRangeState {
  if (changed === 'startTime') {
    if (!state.duration || !value) return { ...state, startTime: value }
    return { ...state, startTime: value, endTime: addMinutesToTime(value, Number(state.duration) || 0) }
  }

  if (changed === 'endTime') {
    if (!state.startTime || !value) return { ...state, endTime: value }
    const minutes = minutesBetween(state.startTime, value)
    return minutes === null ? { ...state, endTime: value } : { ...state, endTime: value, duration: String(minutes) }
  }

  if (!state.startTime || !value) return { ...state, duration: value }
  return { ...state, duration: value, endTime: addMinutesToTime(state.startTime, Number(value) || 0) }
}

export interface LectureSeries {
  title: string
  location: string | null
  weekday: string
  time: string
  intervalDays: 7 | 14
  firstDate: string
  lastDate: string
  lectures: Lecture[]
}

export type LectureGroup = { type: 'series'; series: LectureSeries } | { type: 'single'; lecture: Lecture }

function earliestDate(group: LectureGroup) {
  return group.type === 'series' ? group.series.firstDate : group.lecture.scheduled_at
}

/** Groups lectures sharing a title/location into a recurring series when they fall on a
 * consistent 7- or 14-day cadence, so the UI can show one summary line instead of every row. */
export function groupLectures(lectures: Lecture[]): LectureGroup[] {
  const byKey = new Map<string, Lecture[]>()
  for (const lecture of lectures) {
    const key = `${lecture.title} ${lecture.location ?? ''}`
    const list = byKey.get(key) ?? []
    list.push(lecture)
    byKey.set(key, list)
  }

  const groups: LectureGroup[] = []
  for (const list of byKey.values()) {
    const sorted = [...list].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

    if (sorted.length < 2) {
      groups.push({ type: 'single', lecture: sorted[0] })
      continue
    }

    const gaps = sorted.slice(1).map((lecture, i) => {
      const prev = new Date(sorted[i].scheduled_at).getTime()
      const cur = new Date(lecture.scheduled_at).getTime()
      return Math.round((cur - prev) / 86_400_000)
    })
    const interval = gaps[0]
    const isConsistentSeries = (interval === 7 || interval === 14) && gaps.every((gap) => gap === interval)

    if (!isConsistentSeries) {
      for (const lecture of sorted) groups.push({ type: 'single', lecture })
      continue
    }

    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const date = new Date(first.scheduled_at)
    groups.push({
      type: 'series',
      series: {
        title: first.title,
        location: first.location,
        weekday: date.toLocaleDateString(undefined, { weekday: 'long' }),
        time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
        intervalDays: interval as 7 | 14,
        firstDate: first.scheduled_at,
        lastDate: last.scheduled_at,
        lectures: sorted,
      },
    })
  }

  return groups.sort((a, b) => new Date(earliestDate(a)).getTime() - new Date(earliestDate(b)).getTime())
}

/** Lectures synced from one calendar feed's series (same feed and title), for a read-only summary. */
export interface FeedLectureGroup {
  feedId: number
  title: string
  lectures: Lecture[]
  /** The first lecture at or after `now`, or null once the series is over. */
  next: Lecture | null
}

/** Splits lectures into hand-made ones and feed-synced groups (by feed + title, in first-lecture
 * order). Feed lectures stay out of `groupLectures`: timetables skip weeks, which would fragment its
 * 7/14-day series inference, and they can't be edited anyway. */
export function splitFeedLectures(
  lectures: Lecture[],
  now: Date = new Date(),
): { manual: Lecture[]; feedGroups: FeedLectureGroup[] } {
  const manual: Lecture[] = []
  const byKey = new Map<string, FeedLectureGroup>()
  const sorted = [...lectures].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  for (const lecture of sorted) {
    if (lecture.feed_id === null) {
      manual.push(lecture)
      continue
    }
    const key = `${lecture.feed_id}\u0000${lecture.title}`
    let group = byKey.get(key)
    if (!group) {
      group = { feedId: lecture.feed_id, title: lecture.title, lectures: [], next: null }
      byKey.set(key, group)
    }
    group.lectures.push(lecture)
    if (!group.next && new Date(lecture.scheduled_at) >= now) group.next = lecture
  }
  return { manual, feedGroups: [...byKey.values()] }
}
