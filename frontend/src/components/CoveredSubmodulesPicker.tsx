import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

/** Checkbox list of the Module's Submodules an Assignment covers, shared by both Assignment dialogs. */
export function CoveredSubmodulesPicker({
  submodules,
  value,
  onChange,
}: {
  submodules: { id: number; title: string }[]
  value: number[]
  onChange: (next: number[]) => void
}) {
  const allSelected = submodules.length > 0 && submodules.every((s) => value.includes(s.id))

  function toggle(id: number, checked: boolean) {
    onChange(checked ? [...value, id] : value.filter((v) => v !== id))
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>Covered submodules</Label>
        {submodules.length > 0 && (
          <button
            type="button"
            onClick={() => onChange(allSelected ? [] : submodules.map((s) => s.id))}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {allSelected ? 'Clear' : 'Select all'}
          </button>
        )}
      </div>
      {submodules.length === 0 ? (
        <p className="text-sm text-muted-foreground">This module has no submodules yet.</p>
      ) : (
        <ul className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg border p-2">
          {submodules.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <Checkbox
                id={`covered-submodule-${s.id}`}
                checked={value.includes(s.id)}
                onCheckedChange={(checked) => toggle(s.id, checked === true)}
              />
              <Label htmlFor={`covered-submodule-${s.id}`} className="truncate font-normal">
                {s.title}
              </Label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
