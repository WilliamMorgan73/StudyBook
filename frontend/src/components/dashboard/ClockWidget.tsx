import { useEffect, useState } from 'react'

import { TimeZonePicker } from '@/components/dashboard/TimeZonePicker'
import { useWidgetConfig } from '@/components/dashboard/widgetInstance'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CLOCK_CONFIG, CLOCK_LABEL_MAX, clockParts, handAngles, nextTickDelay, type ClockConfig, type ClockStyle } from '@/lib/clock'
import { useElementSize } from '@/lib/useElementSize'

/** The current time, updated on each whole second (with seconds shown) or whole minute. */
function useNow(showSeconds: boolean): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, nextTickDelay(new Date(), showSeconds))
    }
    // Turning seconds on waits at most a second, since the first tick lands on the next whole one.
    schedule()
    return () => clearTimeout(timer)
  }, [showSeconds])
  return now
}

/** Line height of the date and label lines under the time or face (px), at their smallest. */
const CAPTION_LINE = 20

export function ClockWidget() {
  const [cfg] = useWidgetConfig(CLOCK_CONFIG)
  const now = useNow(cfg.showSeconds)
  const [sizeRef, size] = useElementSize<HTMLDivElement>()
  const parts = clockParts(now, cfg)
  const captions = [cfg.label, cfg.showDate ? parts.date : ''].filter(Boolean)
  const zoneTitle = cfg.timeZone ? cfg.timeZone.replaceAll('_', ' ') : 'System time'

  return (
    <div ref={sizeRef} className="flex min-h-0 flex-1 items-center justify-center" title={zoneTitle}>
      {size.width > 0 &&
        (cfg.style === 'analog' ? (
          <AnalogClock parts={parts} showSeconds={cfg.showSeconds} captions={captions} width={size.width} height={size.height} />
        ) : (
          <DigitalClock parts={parts} captions={captions} width={size.width} height={size.height} />
        ))}
    </div>
  )
}

function Captions({ lines, fontSize }: { lines: string[]; fontSize: number }) {
  return (
    <div className="flex max-w-full flex-col items-center text-center leading-tight text-muted-foreground" style={{ fontSize }}>
      {lines.map((line, index) => (
        <p key={index} className={`max-w-full truncate ${index === 0 && lines.length > 1 ? 'font-medium text-foreground' : ''}`}>
          {line}
        </p>
      ))}
    </div>
  )
}

/**
 * The time as large as the widget allows: wide enough for every digit, short enough to leave room
 * for the label and date. When the captions would squeeze the time too small, they go.
 */
function DigitalClock({
  parts,
  captions,
  width,
  height,
}: {
  parts: ReturnType<typeof clockParts>
  captions: string[]
  width: number
  height: number
}) {
  // Rough glyph widths in em: tabular digits ≈ 0.62, the AM/PM suffix is set at 0.4em.
  const ems = parts.time.length * 0.62 + (parts.period ? parts.period.length * 0.3 + 0.3 : 0)
  const fit = (lines: number) => Math.min(width / ems, height / (1.15 + lines * 0.32), 160)
  let shown = captions
  let fontSize = fit(shown.length)
  if (shown.length > 0 && (fontSize < 30 || height < 1.15 * fontSize + shown.length * CAPTION_LINE)) {
    shown = []
    fontSize = fit(0)
  }
  fontSize = Math.max(14, fontSize)
  const captionSize = Math.max(12, Math.min(20, fontSize * 0.22))

  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <p className="leading-none font-semibold tracking-tight whitespace-nowrap tabular-nums" style={{ fontSize }}>
        {parts.time}
        {parts.period && <span className="ml-[0.15em] text-[0.4em] font-medium text-muted-foreground">{parts.period}</span>}
      </p>
      {shown.length > 0 && <Captions lines={shown} fontSize={captionSize} />}
    </div>
  )
}

/** Face size limits (px), like the Progress ring's. */
const FACE_FLOOR = 48
const FACE_MAX = 640

/** An SVG face in theme colours that grows with the widget; captions go when there's no room. */
function AnalogClock({
  parts,
  showSeconds,
  captions,
  width,
  height,
}: {
  parts: ReturnType<typeof clockParts>
  showSeconds: boolean
  captions: string[]
  width: number
  height: number
}) {
  // Captions grow with the face, so a big clock doesn't end up with a tiny label.
  const captionSize = Math.max(12, Math.min(20, Math.min(width, height) * 0.04))
  const captionRoom = 8 + captions.length * captionSize * 1.5
  const shown = captions.length > 0 && Math.min(width, height - captionRoom) >= 96 ? captions : []
  const face = Math.round(Math.min(FACE_MAX, Math.max(FACE_FLOOR, Math.min(width, shown.length ? height - captionRoom : height))))
  const angles = handAngles(parts)

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={face} height={face} viewBox="0 0 100 100" role="img" aria-label={`${parts.time} ${parts.period}`.trim()}>
        <circle cx="50" cy="50" r="48" className="fill-card stroke-border" strokeWidth="1.5" />
        {Array.from({ length: 60 }, (_, i) => {
          const hourMark = i % 5 === 0
          if (!hourMark && face < 120) return null
          return (
            <line
              key={i}
              x1="50"
              y1={hourMark ? (i % 15 === 0 ? 6 : 7) : 6}
              x2="50"
              y2={hourMark ? (i % 15 === 0 ? 14 : 12) : 8.5}
              transform={`rotate(${i * 6} 50 50)`}
              className={hourMark ? 'stroke-foreground' : 'stroke-muted-foreground/60'}
              strokeWidth={hourMark ? (i % 15 === 0 ? 2.2 : 1.5) : 0.8}
              strokeLinecap="round"
            />
          )
        })}
        <line
          x1="50"
          y1="54"
          x2="50"
          y2="26"
          transform={`rotate(${angles.hour} 50 50)`}
          className="stroke-foreground"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <line
          x1="50"
          y1="56"
          x2="50"
          y2="13"
          transform={`rotate(${angles.minute} 50 50)`}
          className="stroke-foreground"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        {showSeconds && (
          <line
            x1="50"
            y1="60"
            x2="50"
            y2="10"
            transform={`rotate(${angles.second} 50 50)`}
            className="stroke-primary"
            strokeWidth="1"
            strokeLinecap="round"
          />
        )}
        <circle cx="50" cy="50" r="2.6" className={showSeconds ? 'fill-primary' : 'fill-foreground'} />
      </svg>
      {shown.length > 0 && <Captions lines={shown} fontSize={captionSize} />}
    </div>
  )
}

/** The ⚙ form: style, zone and label, and what to show. */
export function ClockSettings() {
  const [cfg, setCfg] = useWidgetConfig(CLOCK_CONFIG)
  const set = (patch: Partial<ClockConfig>) => setCfg({ ...cfg, ...patch })

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={cfg.style} onValueChange={(v) => set({ style: v as ClockStyle })}>
        <TabsList className="w-full">
          <TabsTrigger value="digital">Digital</TabsTrigger>
          <TabsTrigger value="analog">Analog</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="clock-zone">Time zone</Label>
        <TimeZonePicker id="clock-zone" value={cfg.timeZone} onChange={(timeZone) => set({ timeZone })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="clock-label">Label</Label>
        <Input
          id="clock-label"
          placeholder="e.g. Home"
          maxLength={CLOCK_LABEL_MAX}
          value={cfg.label}
          onChange={(e) => set({ label: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2.5">
        <CheckRow id="clock-date" label="Show date" checked={cfg.showDate} onChange={(showDate) => set({ showDate })} />
        <CheckRow id="clock-seconds" label="Show seconds" checked={cfg.showSeconds} onChange={(showSeconds) => set({ showSeconds })} />
        {cfg.style === 'digital' && (
          <CheckRow id="clock-24h" label="24-hour time" checked={!cfg.hour12} onChange={(h24) => set({ hour12: !h24 })} />
        )}
      </div>
    </div>
  )
}

function CheckRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  )
}
