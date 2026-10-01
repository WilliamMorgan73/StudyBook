export type Rating = 'again' | 'hard' | 'good' | 'easy'

/** The four study-session buttons, in display order, mapped onto SM-2's 0–5 quality scale. */
export const RATINGS: { rating: Rating; label: string; quality: number; key: string }[] = [
  { rating: 'again', label: 'Again', quality: 1, key: '1' },
  { rating: 'hard', label: 'Hard', quality: 3, key: '2' },
  { rating: 'good', label: 'Good', quality: 4, key: '3' },
  { rating: 'easy', label: 'Easy', quality: 5, key: '4' },
]

export type StudyKeyAction = { type: 'reveal' } | { type: 'rate'; quality: number } | null

/** Space/Enter reveal the back; 1–4 rate, but only once the back is showing. */
export function studyKeyAction(key: string, revealed: boolean): StudyKeyAction {
  if (!revealed) return key === ' ' || key === 'Enter' ? { type: 'reveal' } : null
  const match = RATINGS.find((r) => r.key === key)
  return match ? { type: 'rate', quality: match.quality } : null
}
