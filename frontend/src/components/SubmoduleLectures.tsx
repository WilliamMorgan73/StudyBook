import { CalendarClock } from 'lucide-react'

import type { Lecture } from '@/lib/api'
import { lecturesCovering } from '@/lib/lectureSchedule'

function formatLecture(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function LectureChip({ lecture, past }: { lecture: Lecture; past: boolean }) {
  return (
    <li
      title={[lecture.title, lecture.location].filter(Boolean).join(' · ')}
      className={`rounded-md border px-1.5 py-0.5 text-xs ${past ? 'text-muted-foreground' : 'text-foreground'}`}
    >
      {formatLecture(lecture.scheduled_at)}
    </li>
  )
}

/**
 * The lectures that covered this Submodule (set from a lecture's "Link notes"), upcoming then past.
 * Renders nothing when none have.
 */
export function SubmoduleLectures({ lectures, submoduleId }: { lectures: Lecture[]; submoduleId: number }) {
  const { past, upcoming } = lecturesCovering(lectures, submoduleId)
  if (past.length === 0 && upcoming.length === 0) return null

  return (
    <section className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <CalendarClock className="size-4" /> Lectures
      </span>
      {upcoming.length > 0 && (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label="Upcoming lectures">
          {upcoming.map((l) => (
            <LectureChip key={l.id} lecture={l} past={false} />
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label="Past lectures">
          <li className="text-xs text-muted-foreground">Past:</li>
          {past.map((l) => (
            <LectureChip key={l.id} lecture={l} past />
          ))}
        </ul>
      )}
    </section>
  )
}
