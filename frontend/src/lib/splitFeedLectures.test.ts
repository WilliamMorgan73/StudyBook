import { describe, expect, it } from 'vitest'

import type { Lecture } from '@/lib/api'
import { splitFeedLectures } from '@/lib/lectureSchedule'

function lecture(id: number, scheduledAt: string, feedId: number | null, title = 'COMP3001 Lecture'): Lecture {
  return {
    id,
    module_id: 1,
    title,
    scheduled_at: scheduledAt,
    duration_minutes: 60,
    location: null,
    week_number: null,
    feed_id: feedId,
  }
}

describe('splitFeedLectures', () => {
  const now = new Date('2026-10-07T12:00:00')

  it('keeps hand-made lectures apart and groups feed ones by feed and title', () => {
    const manual = lecture(1, '2026-10-06T09:00:00', null, 'Seminar')
    const { manual: hand, feedGroups } = splitFeedLectures(
      [
        lecture(4, '2026-10-12T10:00:00', 7),
        manual,
        lecture(3, '2026-10-05T10:00:00', 7),
        lecture(5, '2026-10-08T13:00:00', 7, 'COMP3001 Lab'),
        lecture(6, '2026-10-09T10:00:00', 8),
      ],
      now,
    )

    expect(hand).toEqual([manual])
    expect(feedGroups.map((g) => [g.feedId, g.title, g.lectures.map((l) => l.id), g.next?.id ?? null])).toEqual([
      [7, 'COMP3001 Lecture', [3, 4], 4],
      [7, 'COMP3001 Lab', [5], 5],
      [8, 'COMP3001 Lecture', [6], 6],
    ])
  })

  it('has no next lecture once a series is over', () => {
    const { feedGroups } = splitFeedLectures([lecture(3, '2026-10-05T10:00:00', 7)], now)
    expect(feedGroups[0].next).toBeNull()
  })
})
