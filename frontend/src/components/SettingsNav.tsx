import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useId } from 'react'

/** The category sidebar shared by the settings dialogs; the active highlight glides between items. */
export function SettingsNav<T extends string>({
  categories,
  value,
  onChange,
}: {
  categories: { id: T; label: string; icon: LucideIcon }[]
  value: T
  onChange: (id: T) => void
}) {
  const uid = useId()

  return (
    <nav className="w-44 shrink-0 space-y-0.5 border-r bg-muted/30 p-2">
      {categories.map(({ id, label, icon: Icon }) => {
        const active = value === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`relative flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              active ? 'font-medium' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`${uid}-active`}
                className="absolute inset-0 rounded-lg bg-background shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <Icon className="relative size-4 shrink-0" />
            <span className="relative">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
