import { MODULE_COLOR_SWATCHES } from '@/lib/colors'

export function ColorSwatchPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {MODULE_COLOR_SWATCHES.map((swatch) => (
        <button
          key={swatch}
          type="button"
          aria-label={`Use color ${swatch}`}
          aria-pressed={value === swatch}
          onClick={() => onChange(swatch)}
          className={`size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow ${
            value === swatch ? 'ring-2 ring-foreground' : 'hover:ring-2 hover:ring-foreground/30'
          }`}
          style={{ backgroundColor: swatch }}
        />
      ))}
    </div>
  )
}
