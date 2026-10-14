import { useEffect, useState } from 'react'

import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { refreshModuleLectures } from '@/lib/api'
import { refreshSummary } from '@/lib/lectureRefresh'

/** How long the result line stays up. */
const SHOW_MS = 6000

/**
 * Fetches the module's lectures from its calendars now, for lectures added to a calendar after the
 * module was set up: every calendar address is fetched (not just those over an hour old), and
 * series named with the module's course code are linked to it. Shows a line saying what changed.
 */
export function RefreshLecturesButton({ moduleId, onRefreshed }: { moduleId: number; onRefreshed: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), SHOW_MS)
    return () => clearTimeout(timer)
  }, [message])

  async function refresh() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await refreshModuleLectures(moduleId)
      await onRefreshed()
      setMessage({ text: refreshSummary(result), error: result.failed.length > 0 })
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Couldn’t refresh lectures', error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {message && (
        <span role="status" className={`hidden max-w-80 truncate text-xs md:inline ${message.error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {message.text}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void refresh()}
        disabled={busy}
        title="Fetch lectures from your calendars now, including new ones named with this module's code"
      >
        <RefreshCw className={busy ? 'animate-spin' : ''} /> Refresh lectures
      </Button>
    </div>
  )
}
