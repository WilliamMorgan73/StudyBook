import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateAppSettings, type AppSettings } from '@/lib/api'

export function AppSettingsDialog({
  settings,
  open,
  onOpenChange,
  onChanged,
}: {
  settings: AppSettings
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [maxCredits, setMaxCredits] = useState(settings.max_credits !== null ? String(settings.max_credits) : '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setMaxCredits(settings.max_credits !== null ? String(settings.max_credits) : '')
    }
  }, [open, settings.max_credits])

  async function handleSave() {
    setSaving(true)
    try {
      await updateAppSettings({ max_credits: maxCredits ? Number(maxCredits) : null })
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="max-credits">Max credits</Label>
          <Input
            id="max-credits"
            type="number"
            min={0}
            value={maxCredits}
            onChange={(e) => setMaxCredits(e.target.value)}
            placeholder="No limit"
          />
          <p className="text-xs text-muted-foreground">
            Caps how many module credits you can take on at once. Leave blank for no limit.
          </p>
        </div>
        <div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
