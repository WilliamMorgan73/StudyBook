import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

import { filterSlashCommands, planSlashInsert, type SlashCommand } from '@/lib/markdownBlocks'

import { openDialogEffect } from './editorActions'
import { isInsideCode } from './syntax'

// `/query` at line start or after whitespace, so "and/or" or a URL path never opens the menu.
const SLASH_BEFORE_CURSOR = /(?:^|\s)\/\w*$/

function applySlashCommand(command: SlashCommand) {
  return (view: EditorView, _completion: unknown, from: number, to: number) => {
    if (command.action) {
      view.dispatch({ changes: { from, to }, effects: openDialogEffect.of(command.action), userEvent: 'input.complete' })
      return
    }
    const line = view.state.doc.lineAt(from)
    const { replaceBack, text, selection } = planSlashInsert(command.insert, line.text.slice(0, from - line.from))
    const replaceFrom = from - replaceBack
    view.dispatch({
      changes: { from: replaceFrom, to, insert: text },
      selection: EditorSelection.range(replaceFrom + selection.from, replaceFrom + selection.to),
      userEvent: 'input.complete',
    })
  }
}

function slashCompletionSource(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(SLASH_BEFORE_CURSOR)
  if (!match) return null
  const slashFrom = match.from + match.text.lastIndexOf('/')
  if (isInsideCode(context.state, slashFrom)) return null

  const options = filterSlashCommands(context.state.sliceDoc(slashFrom + 1, context.pos)).map((command) => ({
    label: command.label,
    // The one-word name to type, so it's learnable from the menu.
    detail: command.detail ?? `/${command.id}`,
    apply: applySlashCommand(command),
  }))
  if (options.length === 0) return null
  // filter: false since filterSlashCommands already matched (and `/table4x2` yields an option
  // whose label doesn't contain the typed text). No validFor, so every keystroke re-queries.
  return { from: slashFrom, options, filter: false }
}

export const slashMenu = autocompletion({
  override: [slashCompletionSource],
  icons: false,
})
