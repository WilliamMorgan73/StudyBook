// The Study activity widget (#95): a GitHub-style heatmap of flashcard reviews per day, and streaks.
// A study day is a day with at least one review.

/** Local "YYYY-MM-DD", the activity endpoint's keys. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** Monday-first columns of `weeks` weeks ending with this week; days after `today` are null. */
export function activityWeeks(today: Date, weeks: number): (Date | null)[][] {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const monday = addDays(day, -((day.getDay() + 6) % 7))
  const first = addDays(monday, -(weeks - 1) * 7)
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(first, w * 7 + d)
      return date > day ? null : date
    }),
  )
}

/**
 * The current streak (study days in a row up to today, or up to yesterday while today has none
 * yet, since the day isn't over) and the longest streak in the data.
 */
export function streaks(counts: Readonly<Record<string, number>>, today: Date): { current: number; longest: number } {
  const studied = (date: Date) => (counts[dayKey(date)] ?? 0) > 0
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (!studied(cursor)) cursor = addDays(cursor, -1)
  let current = 0
  while (studied(cursor)) {
    current++
    cursor = addDays(cursor, -1)
  }

  const days = Object.keys(counts)
    .filter((k) => counts[k] > 0)
    .sort()
  let longest = 0
  let run = 0
  let previous: Date | null = null
  for (const key of days) {
    const [y, m, d] = key.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    run = previous && dayKey(addDays(previous, 1)) === key ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = date
  }
  return { current, longest: Math.max(longest, current) }
}

/** 0 (none) to 4 (busiest), relative to the busiest day shown, like GitHub's ramp. */
export function activityLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4))) as 1 | 2 | 3 | 4
}
