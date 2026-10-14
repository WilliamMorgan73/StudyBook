// The Pinned widget (#90): quick-launch tiles for modules, topics, assignments and external links,
// kept in each copy's own settings. App items keep a title snapshot so tiles draw without a fetch,
// and show as "Missing" once the item is gone.

import type { WidgetConfigSpec } from '@/lib/dashboardLayout'

/** Icons a link tile can have; the widget maps each to a Lucide icon. */
export const PIN_ICONS = ['link', 'globe', 'book', 'library', 'calendar', 'graduation', 'mail', 'video', 'file', 'code'] as const
export type PinIcon = (typeof PIN_ICONS)[number]

export type PinnedTile =
  | { kind: 'module'; moduleId: number; title: string }
  | { kind: 'topic'; moduleId: number; submoduleId: number; title: string }
  | { kind: 'assignment'; moduleId: number; assignmentId: number; title: string }
  | { kind: 'link'; url: string; title: string; icon: PinIcon }

export interface PinnedConfig extends Record<string, unknown> {
  tiles: PinnedTile[]
}

export const MAX_TILES = 24
export const MAX_TITLE = 60

const isId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0

/** An http(s) URL, or null. Bare domains ("moodle.ac.uk") get https:// in front. */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function normalizeTile(raw: unknown): PinnedTile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const title = typeof r.title === 'string' ? r.title.trim().slice(0, MAX_TITLE) : ''
  switch (r.kind) {
    case 'module':
      return isId(r.moduleId) ? { kind: 'module', moduleId: r.moduleId, title } : null
    case 'topic':
      return isId(r.moduleId) && isId(r.submoduleId) ? { kind: 'topic', moduleId: r.moduleId, submoduleId: r.submoduleId, title } : null
    case 'assignment':
      return isId(r.moduleId) && isId(r.assignmentId)
        ? { kind: 'assignment', moduleId: r.moduleId, assignmentId: r.assignmentId, title }
        : null
    case 'link': {
      const url = typeof r.url === 'string' ? normalizeUrl(r.url) : null
      if (!url) return null
      const icon = PIN_ICONS.includes(r.icon as PinIcon) ? (r.icon as PinIcon) : 'link'
      return { kind: 'link', url, title: title || new URL(url).hostname, icon }
    }
    default:
      return null
  }
}

export const PINNED_CONFIG: WidgetConfigSpec<PinnedConfig> = {
  normalize(raw) {
    const tiles = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).tiles : undefined
    if (!Array.isArray(tiles)) return { tiles: [] }
    return { tiles: tiles.map(normalizeTile).filter((t): t is PinnedTile => t !== null).slice(0, MAX_TILES) }
  },
}

/** Where a tile goes: an app route, or the link's URL. */
export function tileHref(tile: PinnedTile): string {
  switch (tile.kind) {
    case 'module':
      return `/modules/${tile.moduleId}`
    case 'topic':
      return `/modules/${tile.moduleId}/submodules/${tile.submoduleId}`
    case 'assignment':
      return `/modules/${tile.moduleId}/assignments/${tile.assignmentId}`
    case 'link':
      return tile.url
  }
}

/** A key that's the same for two tiles pinning the same thing, so it isn't pinned twice. */
export function tileKey(tile: PinnedTile): string {
  return tile.kind === 'link' ? `link:${tile.url}` : `${tile.kind}:${tileHref(tile)}`
}

/** Adds a tile at the end, unless it's already pinned or the widget is full. */
export function addTile(tiles: readonly PinnedTile[], tile: PinnedTile): PinnedTile[] {
  if (tiles.length >= MAX_TILES || tiles.some((t) => tileKey(t) === tileKey(tile))) return [...tiles]
  return [...tiles, tile]
}

/** The tiles with the one at `index` moved one place earlier (-1) or later (1). */
export function moveTile(tiles: readonly PinnedTile[], index: number, delta: -1 | 1): PinnedTile[] {
  const to = index + delta
  if (index < 0 || index >= tiles.length || to < 0 || to >= tiles.length) return [...tiles]
  const next = [...tiles]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

export function removeTile(tiles: readonly PinnedTile[], index: number): PinnedTile[] {
  return tiles.filter((_, i) => i !== index)
}

/** Which app items still exist, for the "Missing" state. Undefined sets mean "not loaded yet". */
export interface Existing {
  modules?: ReadonlySet<number>
  topics?: ReadonlySet<number>
  assignments?: ReadonlySet<number>
}

/** Whether the item a tile points at is known to be gone. Links never are. */
export function isMissing(tile: PinnedTile, existing: Existing): boolean {
  switch (tile.kind) {
    case 'module':
      return existing.modules !== undefined && !existing.modules.has(tile.moduleId)
    case 'topic':
      return existing.topics !== undefined && !existing.topics.has(tile.submoduleId)
    case 'assignment':
      return existing.assignments !== undefined && !existing.assignments.has(tile.assignmentId)
    case 'link':
      return false
  }
}
