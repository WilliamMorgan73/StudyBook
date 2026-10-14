import { RotateCcw, WifiOff } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { isDesktop } from '@/lib/desktop'

const DEFAULT_DESCRIPTION =
  "Couldn't connect to the local StudyBook backend. Make sure the server is running, then try again."

/** Shown when a page's data couldn't be fetched because the backend is down or erroring. */
export function ServerOfflineState({
  onRetry,
  description = DEFAULT_DESCRIPTION,
}: {
  onRetry: () => void | Promise<unknown>
  description?: string
}) {
  return (
    <ErrorState
      icon={WifiOff}
      iconVariant="warning"
      badge="Server offline"
      title="Cannot connect to StudyBook server"
      description={description}
      // The desktop app starts its own server; the command only helps when running from source.
      codeSnippet={isDesktop ? undefined : 'uv run uvicorn app.main:app'}
      primaryAction={{ label: 'Retry connection', onClick: () => void onRetry(), icon: RotateCcw }}
    />
  )
}
