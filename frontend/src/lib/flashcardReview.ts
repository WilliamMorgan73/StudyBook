import type { FlashcardProposal } from '@/lib/api'

export const DEFAULT_CARD_COUNT = 10
/** Mirrors the backend's `MAX_CARD_COUNT`. */
export const MAX_CARD_COUNT = 30

/** `saving` while its create request is in flight; `accepted` once the card exists. */
export type ProposalStatus = 'pending' | 'saving' | 'accepted' | 'rejected'

export interface ReviewItem {
  key: number
  front: string
  back: string
  status: ProposalStatus
}

export function reviewItems(proposals: FlashcardProposal[]): ReviewItem[] {
  return proposals.map((p, key) => ({ key, front: p.front, back: p.back, status: 'pending' }))
}

export function updateItem(items: ReviewItem[], key: number, patch: Partial<Omit<ReviewItem, 'key'>>): ReviewItem[] {
  return items.map((item) => (item.key === key ? { ...item, ...patch } : item))
}

export function pendingItems(items: ReviewItem[]): ReviewItem[] {
  return items.filter((item) => item.status === 'pending')
}

export function countByStatus(items: ReviewItem[]): Record<ProposalStatus, number> {
  const counts: Record<ProposalStatus, number> = { pending: 0, saving: 0, accepted: 0, rejected: 0 }
  for (const item of items) counts[item.status] += 1
  return counts
}

/** The card-count input as a whole number within 1..MAX, or the default when it isn't a number. */
export function clampCardCount(value: string): number {
  const n = Math.round(Number(value))
  if (!value.trim() || !Number.isFinite(n)) return DEFAULT_CARD_COUNT
  return Math.min(MAX_CARD_COUNT, Math.max(1, n))
}

/** An edited card's trimmed sides, or an error when either is blank. */
export function validateEdit(front: string, back: string): { front: string; back: string } | { error: string } {
  const f = front.trim()
  const b = back.trim()
  if (!f || !b) return { error: 'Both sides of the card are required.' }
  return { front: f, back: b }
}
