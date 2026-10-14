// The Grade target widget's settings (#98): a UK degree class or a percentage to aim for, and the
// class boundaries (UK defaults, editable).

import type { WidgetConfigSpec } from '@/lib/dashboardLayout'

export type DegreeClass = 'first' | 'upper' | 'lower' | 'third'

export const DEGREE_CLASSES: { id: DegreeClass; label: string }[] = [
  { id: 'first', label: 'First' },
  { id: 'upper', label: '2:1' },
  { id: 'lower', label: '2:2' },
  { id: 'third', label: 'Third' },
]

export const DEFAULT_BOUNDARIES: Record<DegreeClass, number> = { first: 70, upper: 60, lower: 50, third: 40 }

export interface GradeTargetConfig extends Record<string, unknown> {
  /** A class (aim for its boundary) or `custom` (aim for `percent`). */
  target: DegreeClass | 'custom'
  percent: number
  boundaries: Record<DegreeClass, number>
}

const clampPercent = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value * 10) / 10)) : fallback

export const GRADE_TARGET_CONFIG: WidgetConfigSpec<GradeTargetConfig> = {
  normalize(raw) {
    const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
    const b = typeof r.boundaries === 'object' && r.boundaries !== null ? (r.boundaries as Record<string, unknown>) : {}
    const target = r.target === 'custom' || DEGREE_CLASSES.some((c) => c.id === r.target) ? (r.target as GradeTargetConfig['target']) : 'upper'
    return {
      target,
      percent: clampPercent(r.percent, 60),
      boundaries: {
        first: clampPercent(b.first, DEFAULT_BOUNDARIES.first),
        upper: clampPercent(b.upper, DEFAULT_BOUNDARIES.upper),
        lower: clampPercent(b.lower, DEFAULT_BOUNDARIES.lower),
        third: clampPercent(b.third, DEFAULT_BOUNDARIES.third),
      },
    }
  },
}

/** The mark (%) the settings aim for. */
export function targetPercent(cfg: GradeTargetConfig): number {
  return cfg.target === 'custom' ? cfg.percent : cfg.boundaries[cfg.target]
}

/** "a 2:1" / "a First" / "60%": the target as the widget says it. */
export function targetLabel(cfg: GradeTargetConfig): string {
  if (cfg.target === 'custom') return `${cfg.percent}%`
  const label = DEGREE_CLASSES.find((c) => c.id === cfg.target)!.label
  return `a ${label}`
}

/** The class a mark falls in with these boundaries, or null below a Third. */
export function classOf(mark: number, boundaries: Record<DegreeClass, number>): DegreeClass | null {
  return DEGREE_CLASSES.find((c) => mark >= boundaries[c.id])?.id ?? null
}
