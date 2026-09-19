export interface EditorKeybinds {
  bold: string
  italic: string
  code: string
  wikilink: string
}

// Matches MarkdownEditor's hardcoded formattingKeymap defaults.
export const DEFAULT_KEYBINDS: EditorKeybinds = {
  bold: 'Mod-b',
  italic: 'Mod-i',
  code: 'Mod-e',
  wikilink: 'Mod-Shift-k',
}

export const KEYBIND_ACTIONS: { id: keyof EditorKeybinds; label: string; description: string }[] = [
  { id: 'bold', label: 'Bold', description: 'Wrap the selection in **bold**' },
  { id: 'italic', label: 'Italic', description: 'Wrap the selection in *italic*' },
  { id: 'code', label: 'Inline code', description: 'Wrap the selection in `code`' },
  { id: 'wikilink', label: 'Wikilink', description: 'Wrap the selection in [[a wikilink]]' },
]

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

/** "Mod-Shift-k" -> "⌘+Shift+K" (or "Ctrl+Shift+K" off Mac) for display. */
export function formatKeybind(combo: string): string {
  return combo
    .split('-')
    .map((part) => {
      if (part === 'Mod') return isMac ? '⌘' : 'Ctrl'
      if (part === 'Alt') return isMac ? 'Option' : 'Alt'
      if (part.length === 1) return part.toUpperCase()
      return part
    })
    .join('+')
}

/**
 * Converts a keydown event into a CodeMirror keymap string (e.g. "Mod-Shift-k"), in the same
 * Mod-Shift-Alt-key order MarkdownEditor's formattingKeymap already uses. Returns null for a
 * bare modifier press (still waiting for the real key) or Escape (cancels recording).
 */
export function captureKeybind(e: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta', 'Escape'].includes(e.key)) return null

  const parts: string[] = []
  if (e.metaKey || e.ctrlKey) parts.push('Mod')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key)
  return parts.join('-')
}
