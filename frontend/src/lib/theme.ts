import { useEffect } from 'react'

import { getAppSettings, type Skin, type ThemeMode } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

export const SKINS: { id: Skin; label: string; swatch: { bg: string; fg: string; accent: string } }[] = [
  { id: 'default', label: 'Default', swatch: { bg: 'oklch(0.98 0 0)', fg: 'oklch(0.145 0 0)', accent: 'oklch(0.205 0 0)' } },
  { id: 'slate', label: 'Slate', swatch: { bg: 'oklch(0.98 0.004 260)', fg: 'oklch(0.16 0.02 260)', accent: 'oklch(0.32 0.06 260)' } },
  { id: 'sepia', label: 'Sepia', swatch: { bg: 'oklch(0.97 0.012 80)', fg: 'oklch(0.18 0.02 60)', accent: 'oklch(0.3 0.05 60)' } },
]

function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(mode: ThemeMode, skin: Skin) {
  const root = document.documentElement
  root.classList.toggle('dark', resolveDark(mode))
  if (skin === 'default') delete root.dataset.skin
  else root.dataset.skin = skin
}

/** Applies the persisted theme on load, and keeps "system" mode in sync with OS changes. */
export function useApplyTheme() {
  const { data } = useAsync(() => getAppSettings(), [])

  useEffect(() => {
    if (!data) return
    applyTheme(data.theme_mode, data.skin)

    if (data.theme_mode !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => applyTheme(data.theme_mode, data.skin)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [data])
}
