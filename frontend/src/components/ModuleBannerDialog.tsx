import { useState } from 'react'

import { ArrowDown, ArrowUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateModule, type ModuleDetail } from '@/lib/api'
import {
  BANNER_SIZES,
  BANNER_STATS,
  BANNER_TINTS,
  DEFAULT_BANNER,
  MAX_BANNER_STATS,
  normalizeBanner,
  sameBanner,
  type BannerConfig,
  type BannerStatId,
} from '@/lib/moduleBanner'

const STAT_IDS = Object.keys(BANNER_STATS) as BannerStatId[]

/** Picks the banner's stats (and their order), ring, tint and size, and saves them to the module. */
export function ModuleBannerDialog({
  module,
  open,
  onOpenChange,
  onSaved,
}: {
  module: ModuleDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customise banner</DialogTitle>
        </DialogHeader>
        {/* Mounted per opening, so the draft starts from what's saved. */}
        {open && <BannerForm module={module} onDone={() => onOpenChange(false)} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function BannerForm({
  module,
  onDone,
  onSaved,
}: {
  module: ModuleDetail
  onDone: () => void
  onSaved: () => Promise<void>
}) {
  const [draft, setDraft] = useState<BannerConfig>(() => normalizeBanner(module.banner))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Shown stats first, in their order, then the rest in registry order.
  const ordered = [...draft.stats, ...STAT_IDS.filter((id) => !draft.stats.includes(id))]
  const full = draft.stats.length >= MAX_BANNER_STATS

  function toggle(id: BannerStatId, shown: boolean) {
    setDraft((d) => ({ ...d, stats: shown ? [...d.stats, id] : d.stats.filter((s) => s !== id) }))
  }

  function move(id: BannerStatId, by: -1 | 1) {
    setDraft((d) => {
      const stats = [...d.stats]
      const from = stats.indexOf(id)
      const to = from + by
      if (from < 0 || to < 0 || to >= stats.length) return d
      ;[stats[from], stats[to]] = [stats[to], stats[from]]
      return { ...d, stats }
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      // The default is stored as null, so it keeps tracking DEFAULT_BANNER if that changes.
      await updateModule(module.id, { banner: sameBanner(draft, DEFAULT_BANNER) ? null : draft })
      await onSaved()
      onDone()
    } catch {
      setError("Couldn't save the banner.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">
          Stats <span className="font-normal text-muted-foreground">(up to {MAX_BANNER_STATS})</span>
        </p>
        <ul className="divide-y rounded-lg border">
          {ordered.map((id) => {
            const index = draft.stats.indexOf(id)
            const shown = index >= 0
            return (
              <li key={id} className="flex items-center gap-2 px-3 py-1.5">
                <Checkbox
                  id={`banner-stat-${id}`}
                  checked={shown}
                  disabled={!shown && full}
                  onCheckedChange={(checked) => toggle(id, checked === true)}
                />
                <Label htmlFor={`banner-stat-${id}`} className={`flex-1 font-normal ${!shown ? 'text-muted-foreground' : ''}`}>
                  {BANNER_STATS[id]}
                </Label>
                {shown && (
                  <>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${BANNER_STATS[id]} earlier`}
                      disabled={index === 0}
                      onClick={() => move(id, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${BANNER_STATS[id]} later`}
                      disabled={index === draft.stats.length - 1}
                      onClick={() => move(id, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="banner-ring"
          checked={draft.ring}
          onCheckedChange={(checked) => setDraft((d) => ({ ...d, ring: checked === true }))}
        />
        <Label htmlFor="banner-ring" className="font-normal">
          Show progress ring
        </Label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="banner-tint">Colour tint</Label>
          <Select value={draft.tint} onValueChange={(tint) => setDraft((d) => ({ ...d, tint: tint as BannerConfig['tint'] }))}>
            <SelectTrigger id="banner-tint" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(BANNER_TINTS).map(([value, { label }]) => (
                <SelectItem key={value} value={value}>
                  <span
                    className="size-3 rounded-sm border"
                    style={{ backgroundColor: `${module.color}${BANNER_TINTS[value as BannerConfig['tint']].alpha}` }}
                    aria-hidden
                  />
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="banner-size">Size</Label>
          <Select value={draft.size} onValueChange={(size) => setDraft((d) => ({ ...d, size: size as BannerConfig['size'] }))}>
            <SelectTrigger id="banner-size" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(BANNER_SIZES).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between pt-1">
        <Button size="sm" variant="ghost" onClick={() => setDraft(DEFAULT_BANNER)} disabled={sameBanner(draft, DEFAULT_BANNER)}>
          Default
        </Button>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
