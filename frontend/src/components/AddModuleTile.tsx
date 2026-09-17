import { Plus } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

export const AddModuleTile = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function AddModuleTile(props, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/50 hover:text-foreground"
        {...props}
      >
        <Plus className="size-6" />
        <span className="text-sm font-medium">Add module</span>
      </button>
    )
  },
)
