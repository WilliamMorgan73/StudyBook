import type { Flashcard } from '@/lib/api'

/** How well-learned a card is, from its SM-2 interval (Anki calls 21+ days "mature"). */
export type Maturity = 'new' | 'learning' | 'known' | 'mastered'

/**
 * Strongest first, as the bars draw them. `strength` is how much of the module colour the step
 * uses; new cards use the muted background instead.
 */
export const MATURITY_STEPS: { maturity: Maturity; label: string; strength: number }[] = [
  { maturity: 'mastered', label: 'Mastered', strength: 100 },
  { maturity: 'known', label: 'Known', strength: 65 },
  { maturity: 'learning', label: 'Learning', strength: 35 },
  { maturity: 'new', label: 'New', strength: 0 },
]

const KNOWN_FROM_DAYS = 7
const MASTERED_FROM_DAYS = 21

export function cardMaturity(card: Pick<Flashcard, 'last_reviewed_at' | 'interval_days'>): Maturity {
  if (!card.last_reviewed_at) return 'new'
  if (card.interval_days >= MASTERED_FROM_DAYS) return 'mastered'
  if (card.interval_days >= KNOWN_FROM_DAYS) return 'known'
  return 'learning'
}

export function maturityCounts(cards: readonly Flashcard[]): Record<Maturity, number> {
  const counts: Record<Maturity, number> = { new: 0, learning: 0, known: 0, mastered: 0 }
  for (const card of cards) counts[cardMaturity(card)]++
  return counts
}

/** The colour of one maturity step, as a mix of the module colour (new cards: muted). */
export function maturityColor(maturity: Maturity, color: string): string {
  const step = MATURITY_STEPS.find((s) => s.maturity === maturity)!
  return step.strength === 0 ? 'var(--muted)' : `color-mix(in oklab, ${color} ${step.strength}%, transparent)`
}

export function isDue(card: Pick<Flashcard, 'due_at'>, now: Date): boolean {
  return new Date(card.due_at) <= now
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** When the card is next up for review, in words: "Due now", "Tomorrow", "In 12 days", "In 3 months". */
export function nextReviewLabel(dueAt: string, now: Date): string {
  const due = new Date(dueAt)
  if (due <= now) return 'Due now'
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS)
  if (days === 0) return 'Later today'
  if (days === 1) return 'Tomorrow'
  if (days < 60) return `In ${days} days`
  return `In ${Math.round(days / 30)} months`
}
