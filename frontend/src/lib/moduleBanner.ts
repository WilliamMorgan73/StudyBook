// The module page banner's config, saved per module as `modules.banner` (null = DEFAULT_BANNER).
// The backend only checks the shape; stat ids are owned here, so read it through `normalizeBanner`.

import type { ModuleBannerConfig } from '@/lib/api'

export type BannerStatId = 'grade' | 'achieved' | 'nextLecture' | 'nextExam' | 'nextDeadline' | 'cardsDue' | 'credits'

export interface BannerConfig extends ModuleBannerConfig {
  stats: BannerStatId[]
}

/** The banner fits this many stats beside the module's name. */
export const MAX_BANNER_STATS = 4

/** Labels for the customise dialog, in the order it lists them. */
export const BANNER_STATS: Record<BannerStatId, string> = {
  grade: 'Current grade',
  achieved: 'Grade achieved so far',
  nextLecture: 'Next lecture',
  nextExam: 'Next exam',
  nextDeadline: 'Next deadline',
  cardsDue: 'Flashcards due',
  credits: 'Credits',
}

export const BANNER_TINTS: Record<BannerConfig['tint'], { label: string; alpha: string }> = {
  none: { label: 'None', alpha: '00' },
  soft: { label: 'Soft', alpha: '1f' },
  strong: { label: 'Strong', alpha: '40' },
}

export const BANNER_SIZES: Record<BannerConfig['size'], string> = {
  compact: 'Compact',
  comfortable: 'Comfortable',
}

/** The banner as it was before it was customisable. */
export const DEFAULT_BANNER: BannerConfig = { stats: ['grade', 'nextLecture'], ring: true, tint: 'soft', size: 'comfortable' }

function isStatId(value: unknown): value is BannerStatId {
  return typeof value === 'string' && Object.hasOwn(BANNER_STATS, value)
}

/**
 * A usable banner config from whatever was stored: unknown and duplicate stats are dropped and the
 * rest capped at MAX_BANNER_STATS; anything else malformed falls back to its default.
 */
export function normalizeBanner(raw: unknown): BannerConfig {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_BANNER
  const { stats, ring, tint, size } = raw as Record<string, unknown>
  return {
    stats: Array.isArray(stats)
      ? [...new Set(stats.filter(isStatId))].slice(0, MAX_BANNER_STATS)
      : DEFAULT_BANNER.stats,
    ring: typeof ring === 'boolean' ? ring : DEFAULT_BANNER.ring,
    tint: typeof tint === 'string' && Object.hasOwn(BANNER_TINTS, tint) ? (tint as BannerConfig['tint']) : DEFAULT_BANNER.tint,
    size: typeof size === 'string' && Object.hasOwn(BANNER_SIZES, size) ? (size as BannerConfig['size']) : DEFAULT_BANNER.size,
  }
}

export function sameBanner(a: BannerConfig, b: BannerConfig): boolean {
  return (
    a.ring === b.ring &&
    a.tint === b.tint &&
    a.size === b.size &&
    a.stats.length === b.stats.length &&
    a.stats.every((s, i) => s === b.stats[i])
  )
}
