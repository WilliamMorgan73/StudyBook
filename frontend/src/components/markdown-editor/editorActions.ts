import { StateEffect } from '@codemirror/state'

import type { EditorDialog } from '@/lib/markdownBlocks'

/**
 * Asks MarkdownEditor (the React side) to open one of its dialogs; dispatched by the `/` menu's
 * dialog commands (Block…, Image…, Embed file…) and picked up in MarkdownEditor's onUpdate.
 */
export const openDialogEffect = StateEffect.define<EditorDialog>()
