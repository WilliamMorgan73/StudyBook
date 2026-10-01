import type { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AI_SETTINGS_HINT, useAIEnabled } from '@/lib/ai'

/**
 * The shared treatment for any action that calls Claude: a normal `Button` when AI is enabled,
 * otherwise disabled with a tooltip pointing to Settings → AI Integration. Pass `aiEnabled` when
 * the page already knows it; otherwise the button reads it from settings itself.
 */
export function AIActionButton({
  aiEnabled,
  disabled,
  ...props
}: ComponentProps<typeof Button> & { aiEnabled?: boolean }) {
  const fetched = useAIEnabled()
  const enabled = aiEnabled ?? fetched

  if (enabled !== false) return <Button {...props} disabled={disabled || enabled === null} />

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Disabled buttons swallow pointer events, so the span carries the tooltip. */}
        <span tabIndex={0} className="inline-flex cursor-not-allowed rounded-lg" aria-label={AI_SETTINGS_HINT}>
          <Button {...props} disabled aria-disabled />
        </span>
      </TooltipTrigger>
      <TooltipContent>{AI_SETTINGS_HINT}</TooltipContent>
    </Tooltip>
  )
}
