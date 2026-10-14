import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** A small trash button for deletes in lists (#118): quiet until hovered or focused, then red. */
export function DeleteIconButton({
  label,
  onClick,
  className,
}: {
  /** "Delete file"; also the tooltip. */
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive dark:hover:bg-destructive/20',
        className,
      )}
    >
      <Trash2 />
    </Button>
  )
}
