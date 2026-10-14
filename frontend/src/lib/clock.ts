// The Clock widget's settings and time maths: every copy has its own style and time zone. Times
// come from `Intl.DateTimeFormat` with `timeZone`, so there's no date library and no offset tables.

import type { WidgetConfigSpec } from '@/lib/dashboardLayout'

export type ClockStyle = 'digital' | 'analog'

export interface ClockConfig extends Record<string, unknown> {
  style: ClockStyle
  /** An IANA zone ("Asia/Tokyo"), or null for the system's. */
  timeZone: string | null
  /** Shown under the time ("Home"); empty for none. */
  label: string
  showDate: boolean
  showSeconds: boolean
  /** 12-hour with AM/PM, else 24-hour. Digital only. */
  hour12: boolean
}

/** Longest label kept, so a pasted paragraph can't blow up the layout. */
export const CLOCK_LABEL_MAX = 40

/** Whether `Intl` knows the zone. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone })
    return true
  } catch {
    return false
  }
}

/** The system's zone, e.g. "Europe/London". */
export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Whether the user's locale writes times as 12-hour by default. */
function localeUses12Hour(): boolean {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? false
}

export const CLOCK_CONFIG: WidgetConfigSpec<ClockConfig> = {
  normalize(raw) {
    const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
    const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
    return {
      style: r.style === 'analog' ? 'analog' : 'digital',
      timeZone: typeof r.timeZone === 'string' && r.timeZone !== '' && isValidTimeZone(r.timeZone) ? r.timeZone : null,
      label: typeof r.label === 'string' ? r.label.slice(0, CLOCK_LABEL_MAX) : '',
      showDate: bool(r.showDate, true),
      showSeconds: bool(r.showSeconds, false),
      hour12: bool(r.hour12, localeUses12Hour()),
    }
  },
}

export interface ClockParts {
  /** "9:05", "09:05:30", "21:05": the digits, without AM/PM. */
  time: string
  /** "AM" / "PM" (as the locale writes it) in 12-hour mode, else empty. */
  period: string
  /** "Tue 13 Oct", in the user's locale. */
  date: string
  /** 0–23, 0–59, 0–59 in the clock's zone, for the analog hands. */
  hours: number
  minutes: number
  seconds: number
}

/** What a clock with these settings shows at `now`. */
export function clockParts(now: Date, cfg: Pick<ClockConfig, 'timeZone' | 'showSeconds' | 'hour12'>, locale?: string): ClockParts {
  const timeZone = cfg.timeZone ?? undefined
  const display = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: cfg.hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    ...(cfg.showSeconds && { second: '2-digit' }),
    hourCycle: cfg.hour12 ? 'h12' : 'h23',
  }).formatToParts(now)
  const period = display.find((p) => p.type === 'dayPeriod')?.value ?? ''
  const time = display
    .filter((p) => p.type === 'hour' || p.type === 'minute' || p.type === 'second' || (p.type === 'literal' && p.value.trim() !== ''))
    .map((p) => p.value)
    .join('')

  const numeric = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(numeric.find((p) => p.type === type)?.value ?? 0)

  const date = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(now)
  return { time, period, date, hours: part('hour') % 24, minutes: part('minute'), seconds: part('second') }
}

/** Milliseconds from `now` to the next whole second (seconds shown) or whole minute. */
export function nextTickDelay(now: Date, showSeconds: boolean): number {
  const ms = now.getTime()
  const step = showSeconds ? 1000 : 60_000
  return step - (ms % step)
}

/** Hand angles in degrees clockwise from 12, moving smoothly between marks. */
export function handAngles({ hours, minutes, seconds }: Pick<ClockParts, 'hours' | 'minutes' | 'seconds'>) {
  return {
    hour: ((hours % 12) + minutes / 60) * 30,
    minute: (minutes + seconds / 60) * 6,
    second: seconds * 6,
  }
}

/** A few zones for runtimes without `Intl.supportedValuesOf`. */
const FALLBACK_ZONES = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Athens',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
]

/** Every IANA zone the runtime knows, A–Z. */
export function timeZoneOptions(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  const zones = supported ? supported('timeZone') : FALLBACK_ZONES
  return zones.includes('UTC') ? zones : ['UTC', ...zones]
}

/** "America/New_York" → "New York"; the city is what people search for and read. */
export function timeZoneCity(timeZone: string): string {
  return (timeZone.split('/').pop() ?? timeZone).replaceAll('_', ' ')
}

/** Zones matching a search, ignoring case and reading `_` and `/` as spaces ("new york", "asia tok"). */
export function filterTimeZones(zones: readonly string[], query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...zones]
  return zones.filter((zone) => {
    const haystack = zone.toLowerCase().replaceAll(/[_/]/g, ' ')
    return words.every((word) => haystack.includes(word))
  })
}
