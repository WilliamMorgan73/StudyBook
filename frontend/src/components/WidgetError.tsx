import { AlertCircle, RotateCcw } from 'lucide-react'
import { motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { enter } from '@/lib/motion'
import { cn } from '@/lib/utils'

export interface WidgetErrorProps {
  message: string
  onRetry?: () => void
  className?: string
}

export function WidgetError({ message, onRetry, className }: WidgetErrorProps) {
  return (
    <motion.div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive',
        className,
      )}
      {...enter}
    >
      <div className="flex min-w-0 items-center gap-2">
        <AlertCircle className="size-4 shrink-0" />
        <span className="truncate font-medium">{message}</span>
      </div>
      {onRetry && (
        <Button
          variant="ghost"
          size="xs"
          onClick={onRetry}
          className="h-6 shrink-0 gap-1 px-2 text-[0.75rem] text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <RotateCcw className="size-3" />
          Retry
        </Button>
      )}
    </motion.div>
  )
}
