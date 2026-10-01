import { Database, Keyboard, Palette, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useState } from 'react'

import { KeybindInput } from '@/components/KeybindInput'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { updateAppSettings, type AppSettings, type Skin, type TableAlignment, type ThemeMode } from '@/lib/api'
import { DEFAULT_KEYBINDS, KEYBIND_ACTIONS, type EditorKeybinds } from '@/lib/keybinds'
import { applyTheme, SKINS } from '@/lib/theme'

type Category = 'appearance' | 'general' | 'keybinds' | 'ai' | 'data'

const CATEGORIES: { id: Category; label: string; icon: typeof Palette }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'keybinds', label: 'Keybinds', icon: Keyboard },
  { id: 'ai', label: 'AI Integration', icon: Sparkles },
  { id: 'data', label: 'Data', icon: Database },
]

const FONT_SIZE_MIN = 10
const FONT_SIZE_MAX = 32

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
  const [category, setCategory] = useState<Category>('appearance')
  // Drafts for the fields that commit on save/blur rather than on click. Everything else reads
  // straight from `settings`, which the parent refetches (in place) after each change.
  const [maxCredits, setMaxCredits] = useState(settings.max_credits !== null ? String(settings.max_credits) : '')
  const [savingCredits, setSavingCredits] = useState(false)
  const [fontSizeDraft, setFontSizeDraft] = useState(String(settings.note_font_size))
  // Theme mode and skin are applied together, so each click must pair with the latest pick of the
  // other, not the `settings` prop, which lags until the refetch lands (skin-then-mode clicked
  // quickly would otherwise re-apply the old skin).
  const [themeMode, setThemeMode] = useState(settings.theme_mode)
  const [skin, setSkin] = useState(settings.skin)
  const keybinds: EditorKeybinds = {
    bold: settings.keybind_bold,
    italic: settings.keybind_italic,
    code: settings.keybind_code,
    wikilink: settings.keybind_wikilink,
  }

  // Reset the category and drafts each time the dialog opens (not on every settings refetch,
  // which would discard an in-progress edit or jump back to Appearance).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setCategory('appearance')
      setMaxCredits(settings.max_credits !== null ? String(settings.max_credits) : '')
      setFontSizeDraft(String(settings.note_font_size))
      setThemeMode(settings.theme_mode)
      setSkin(settings.skin)
    }
  }

  async function handleSaveCredits() {
    setSavingCredits(true)
    try {
      await updateAppSettings({ max_credits: maxCredits ? Number(maxCredits) : null })
      onChanged()
    } finally {
      setSavingCredits(false)
    }
  }

  async function handleThemeMode(mode: ThemeMode) {
    setThemeMode(mode)
    applyTheme(mode, skin)
    await updateAppSettings({ theme_mode: mode })
    onChanged()
  }

  async function handleSkin(nextSkin: Skin) {
    setSkin(nextSkin)
    applyTheme(themeMode, nextSkin)
    await updateAppSettings({ skin: nextSkin })
    onChanged()
  }

  async function handleTableAlignment(next: TableAlignment) {
    await updateAppSettings({ table_alignment: next })
    onChanged()
  }

  async function handleFontSizeCommit() {
    const clamped = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Number(fontSizeDraft) || settings.note_font_size))
    setFontSizeDraft(String(clamped))
    if (clamped === settings.note_font_size) return
    await updateAppSettings({ note_font_size: clamped })
    onChanged()
  }

  async function handleKeybind(action: keyof EditorKeybinds, combo: string) {
    const field = (
      { bold: 'keybind_bold', italic: 'keybind_italic', code: 'keybind_code', wikilink: 'keybind_wikilink' } as const
    )[action]
    await updateAppSettings({ [field]: combo })
    onChanged()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-[30rem]">
          <nav className="w-44 shrink-0 space-y-0.5 border-r bg-muted/30 p-2">
            {CATEGORIES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  category === id
                    ? 'bg-background font-medium shadow-sm'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          <div className="flex-1 space-y-6 p-5">
            {category === 'appearance' && (
              <>
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <Tabs value={themeMode} onValueChange={(v) => handleThemeMode(v as ThemeMode)}>
                    <TabsList>
                      <TabsTrigger value="light">Light</TabsTrigger>
                      <TabsTrigger value="dark">Dark</TabsTrigger>
                      <TabsTrigger value="system">System</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="space-y-2">
                  <Label>Skin</Label>
                  <div className="flex flex-wrap gap-3">
                    {SKINS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSkin(s.id)}
                        aria-pressed={skin === s.id}
                        className={`flex flex-col items-center gap-1.5 rounded-lg p-2 transition-shadow ${
                          skin === s.id ? 'ring-2 ring-foreground' : 'ring-1 ring-border hover:ring-foreground/40'
                        }`}
                      >
                        <span
                          className="flex size-12 items-center justify-center rounded-md"
                          style={{ backgroundColor: s.swatch.bg }}
                        >
                          <span className="size-5 rounded-full" style={{ backgroundColor: s.swatch.accent }} />
                        </span>
                        <span className="text-xs text-muted-foreground">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Table alignment</Label>
                  <Tabs value={settings.table_alignment} onValueChange={(v) => handleTableAlignment(v as TableAlignment)}>
                    <TabsList>
                      <TabsTrigger value="left">Left</TabsTrigger>
                      <TabsTrigger value="center">Center</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <p className="text-xs text-muted-foreground">
                    How rendered tables sit in the notes editor.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="note-font-size">Note font size</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="note-font-size"
                      type="number"
                      min={FONT_SIZE_MIN}
                      max={FONT_SIZE_MAX}
                      value={fontSizeDraft}
                      onChange={(e) => setFontSizeDraft(e.target.value)}
                      onBlur={handleFontSizeCommit}
                      className="max-w-24"
                    />
                    <span className="text-sm text-muted-foreground">px</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Editor text size in submodule notes ({FONT_SIZE_MIN}–{FONT_SIZE_MAX}px).
                  </p>
                </div>
              </>
            )}

            {category === 'general' && (
              <div className="space-y-1.5">
                <Label htmlFor="max-credits">Max credits</Label>
                <Input
                  id="max-credits"
                  type="number"
                  min={0}
                  value={maxCredits}
                  onChange={(e) => setMaxCredits(e.target.value)}
                  placeholder="No limit"
                  className="max-w-40"
                />
                <p className="text-xs text-muted-foreground">
                  Caps how many module credits you can take on at once. Leave blank for no limit.
                </p>
                <Button size="sm" onClick={handleSaveCredits} disabled={savingCredits} className="mt-1">
                  {savingCredits ? 'Saving…' : 'Save'}
                </Button>
              </div>
            )}

            {category === 'keybinds' && (
              <div className="divide-y">
                {KEYBIND_ACTIONS.map(({ id, label, description }) => {
                  const conflict = KEYBIND_ACTIONS.find((other) => other.id !== id && keybinds[other.id] === keybinds[id])
                  return (
                    <KeybindInput
                      key={id}
                      label={label}
                      description={description}
                      value={keybinds[id]}
                      defaultValue={DEFAULT_KEYBINDS[id]}
                      onChange={(combo) => handleKeybind(id, combo)}
                      conflictLabel={conflict?.label}
                    />
                  )
                })}
              </div>
            )}

            {category === 'ai' && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">AI integration is coming soon</p>
                <p className="text-sm text-muted-foreground">
                  Note summarization, note-to-flashcard generation, revision scheduling, and semantic note search
                  using the Anthropic API are planned but not yet available.
                </p>
              </div>
            )}

            {category === 'data' && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Data export is coming soon</p>
                <p className="text-sm text-muted-foreground">
                  Exporting your notes, flashcards, and attachments as a backup isn't available yet.
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
