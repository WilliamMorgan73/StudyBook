import { StateEffect } from '@codemirror/state'

/**
 * Asks MarkdownEditor (the React side) to open the block builder; dispatched by the `/` menu's
 * "Block…" item and picked up in MarkdownEditor's onUpdate.
 */
export const openBlockDialogEffect = StateEffect.define<null>()
