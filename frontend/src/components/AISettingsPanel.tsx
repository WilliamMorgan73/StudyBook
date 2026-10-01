import { CheckCircle2, CircleAlert, KeyRound, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { aiErrorMessage } from '@/lib/ai'
import { listAIModels, testAIConnection, updateAppSettings, type AppSettings } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

export type AISettingsState = Pick<AppSettings, 'has_api_key' | 'ai_enabled' | 'ai_model'>

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'ok'; message: string } | { status: 'error'; message: string }

/**
 * Settings → AI Integration. The key input is write-only: the backend never returns the key,
 * only `has_api_key`, so the field always starts empty and saving replaces whatever is stored.
 */
export function AISettingsPanel({
  settings,
  onSaved,
}: {
  settings: AISettingsState
  onSaved: (next: AISettingsState) => void
}) {
  const models = useAsync(() => listAIModels(), [])
  const [keyDraft, setKeyDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [test, setTest] = useState<TestState>({ status: 'idle' })

  async function save(update: Parameters<typeof updateAppSettings>[0]) {
    setSaving(true)
    setSaveError(null)
    setTest({ status: 'idle' })
    try {
      const next = await updateAppSettings(update)
      onSaved({ has_api_key: next.has_api_key, ai_enabled: next.ai_enabled, ai_model: next.ai_model })
      return true
    } catch (error) {
      setSaveError(aiErrorMessage(error))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveKey(event: FormEvent) {
    event.preventDefault()
    if (!keyDraft.trim()) return
    if (await save({ anthropic_api_key: keyDraft.trim() })) setKeyDraft('')
  }

  async function handleTest() {
    setTest({ status: 'testing' })
    try {
      const result = await testAIConnection()
      const label = models.data?.find((m) => m.id === result.model)?.label ?? result.model
      setTest({ status: 'ok', message: `Connected. ${label} is ready to use.` })
    } catch (error) {
      setTest({ status: 'error', message: aiErrorMessage(error) })
    }
  }

  const keyStatus = settings.has_api_key
    ? 'A key is saved.'
    : settings.ai_enabled
      ? 'Using the key from the backend environment (ANTHROPIC_API_KEY). A key saved here takes precedence.'
      : 'No key set. AI features are turned off until you add one.'

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        AI features (flashcard generation, summaries, revision guidance) call Claude through your own Anthropic API
        key. Everything else works without one.
      </p>

      <form onSubmit={handleSaveKey} className="space-y-1.5">
        <Label htmlFor="anthropic-api-key">Anthropic API key</Label>
        <div className="flex items-center gap-2">
          <Input
            id="anthropic-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder={settings.has_api_key ? '•••••••••••• (paste to replace)' : 'sk-ant-…'}
            className="font-mono"
          />
          <Button type="submit" size="sm" disabled={saving || !keyDraft.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {settings.has_api_key && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => save({ anthropic_api_key: null })}
            >
              Remove
            </Button>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <KeyRound className="size-3.5 shrink-0" />
          {keyStatus}
        </p>
        <p className="text-xs text-muted-foreground">
          Stored only in your local StudyBook database and never shown again after saving.
        </p>
        {saveError && <p className="text-xs text-destructive">{saveError}</p>}
      </form>

      <div className="space-y-1.5">
        <Label htmlFor="ai-model">Model</Label>
        <Select
          value={settings.ai_model}
          onValueChange={(model) => save({ ai_model: model })}
          disabled={saving || !models.data}
        >
          <SelectTrigger id="ai-model" className="w-full max-w-sm">
            <SelectValue placeholder="Loading models…" />
          </SelectTrigger>
          <SelectContent>
            {models.data?.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {models.data?.find((m) => m.id === settings.ai_model)?.description ??
            'Used for every AI feature.'}
        </p>
      </div>

      <div className="space-y-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleTest}
          disabled={!settings.ai_enabled || saving || test.status === 'testing'}
        >
          {test.status === 'testing' && <Loader2 className="animate-spin" />}
          {test.status === 'testing' ? 'Testing…' : 'Test connection'}
        </Button>
        {!settings.ai_enabled && <p className="text-xs text-muted-foreground">Add a key first to test it.</p>}
        {test.status === 'ok' && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400" role="status">
            <CheckCircle2 className="size-4 shrink-0" />
            {test.message}
          </p>
        )}
        {test.status === 'error' && (
          <p className="flex items-start gap-1.5 text-sm text-destructive" role="alert">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {test.message}
          </p>
        )}
      </div>
    </div>
  )
}
