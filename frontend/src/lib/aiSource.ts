/** "~1.2k tokens" style label for a rough input-size estimate. */
export function formatTokenEstimate(tokens: number): string {
  if (tokens < 1000) return `~${Math.max(0, Math.round(tokens))} tokens`
  const thousands = tokens / 1000
  return `~${thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, '') : Math.round(thousands)}k tokens`
}

/** Adds or removes `id` from a raw-PDF opt-in list, keeping it sorted so requests are stable. */
export function toggleRawPdf(ids: number[], id: number, on: boolean): number[] {
  const next = new Set(ids)
  if (on) next.add(id)
  else next.delete(id)
  return [...next].sort((a, b) => a - b)
}
