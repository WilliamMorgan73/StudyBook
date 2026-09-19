import { RotateCcw } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { captureKeybind, formatKeybind } from '@/lib/keybinds'

export function KeybindInput({
  label,
  description,
  value,
  defaultValue,
  onChange,
  conflictLabel,
}: {
  label: string
  description: string
  value: string
  defaultValue: string
  onChange: (next: string) => void
  /** Name of another action already bound to this same combo, if any — shown as a soft warning. */
  conflictLabel?: string
}) {
  const [recording, setRecording] = useState(false)

  function handleKeyDown(e: KeyboardEvent) {
    e.preventDefault()
    if (e.key === 'Escape') {
      setRecording(false)
      return
    }
    const combo = captureKeybind(e)
    if (!combo) return // bare modifier press — keep waiting for the real key
    onChange(combo)
    setRecording(false)
  }

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
        {conflictLabel && !recording && (
          <p className="text-xs text-amber-600 dark:text-amber-500">Also used by {conflictLabel}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setRecording(true)}
          onKeyDown={recording ? handleKeyDown : undefined}
          onBlur={() => setRecording(false)}
          className={`min-w-28 rounded-md border px-2.5 py-1.5 text-center text-xs font-medium transition-colors ${
            recording ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/50'
          }`}
        >
          {recording ? 'Press keys…' : formatKeybind(value)}
        </button>
        {value !== defaultValue && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Reset ${label} to default`}
            onClick={() => onChange(defaultValue)}
          >
            <RotateCcw />
          </Button>
        )}
      </div>
    </div>
  )
}
