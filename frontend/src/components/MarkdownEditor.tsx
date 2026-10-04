import { GFM } from '@lezer/markdown'
import CodeMirror, {
  Decoration,
  EditorView,
  StateEffect,
  StateField,
  type DecorationSet,
  type EditorState,
  type Range,
} from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxTree } from '@codemirror/language'
import { EditorSelection, Prec } from '@codemirror/state'
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { drawSelection, keymap, ViewPlugin, WidgetType, type ViewUpdate } from '@codemirror/view'
import katex from 'katex'
import 'katex/dist/katex.min.css'

import type { Attachment, TableAlignment } from '@/lib/api'
import { DEFAULT_KEYBINDS, type EditorKeybinds } from '@/lib/keybinds'
import {
  attachmentMarkdown,
  buildTableMarkdown,
  type EditorDialog,
  findColumnsBlocks,
  findEmbeds,
  findHighlights,
  parseCalloutHeader,
  parseTableShorthand,
  resolveEmbed,
} from '@/lib/markdownBlocks'

import { CalloutMarkerWidget, ColumnsWidget } from './markdown-editor/blockWidgets'
import {
  attachmentsFacet,
  FileChipWidget,
  ImageWidget,
  MediaEmbedWidget,
} from './markdown-editor/embedWidgets'
import { AttachmentPickerDialog, type PickerMode } from './markdown-editor/AttachmentPickerDialog'
import { openDialogEffect } from './markdown-editor/editorActions'
import { InsertBlockDialog } from './markdown-editor/InsertBlockDialog'
import { BulletWidget, CheckboxWidget, TOGGLE_TASK_EVENT } from './markdown-editor/listWidgets'
import { fileDropHandlers, UPLOAD_EVENT } from './markdown-editor/fileDrop'
import { collapsedEmbeds, folding, loadFoldSnapshot, restoreFolds } from './markdown-editor/folding'
import { slashMenu } from './markdown-editor/slashMenu'
import { isInsideCode } from './markdown-editor/syntax'
import { editorTheme } from './markdown-editor/theme'

const HIDE = Decoration.replace({})

class HorizontalRuleWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement('div')
    hr.className = 'cm-hr'
    return hr
  }
  eq() {
    return true
  }
}

// Matches enough of SyntaxNode's shape to read TableCell children without importing the type
// from @lezer/common directly (not resolvable as a direct import under this project's pnpm
// layout — same workaround as WalkableNode in markdown-editor/syntax.ts).
interface TableRowSource {
  getChildren(type: string): { from: number; to: number }[]
}

function getRowCells(state: EditorState, row: TableRowSource): string[] {
  return row.getChildren('TableCell').map((cell) => state.doc.sliceString(cell.from, cell.to).trim())
}

class TableWidget extends WidgetType {
  header: string[]
  rows: string[][]
  constructor(header: string[], rows: string[][]) {
    super()
    this.header = header
    this.rows = rows
  }
  toDOM() {
    const wrap = document.createElement('div')
    wrap.className = 'cm-table-wrap' // spacing as padding, never a margin (see theme.ts)
    const table = document.createElement('table')
    table.className = 'cm-table'
    wrap.appendChild(table)

    const thead = document.createElement('thead')
    const headRow = document.createElement('tr')
    for (const cell of this.header) {
      const th = document.createElement('th')
      th.textContent = cell
      headRow.appendChild(th)
    }
    thead.appendChild(headRow)
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    for (const row of this.rows) {
      const tr = document.createElement('tr')
      for (const cell of row) {
        const td = document.createElement('td')
        td.textContent = cell
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)

    return wrap
  }
  eq(other: TableWidget) {
    return JSON.stringify(this.header) === JSON.stringify(other.header) && JSON.stringify(this.rows) === JSON.stringify(other.rows)
  }
}

// katex.render throws on malformed input even with throwOnError: false turned off for *display*
// purposes — it still throws for a handful of parse errors, so this stays defensive rather than
// trusting the option alone.
function renderMath(formula: string, el: HTMLElement, displayMode: boolean) {
  try {
    katex.render(formula, el, { throwOnError: false, displayMode })
  } catch {
    el.textContent = formula
  }
}

class MathInlineWidget extends WidgetType {
  formula: string
  constructor(formula: string) {
    super()
    this.formula = formula
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-math-inline'
    renderMath(this.formula, span, false)
    return span
  }
  eq(other: MathInlineWidget) {
    return other.formula === this.formula
  }
}

class MathBlockWidget extends WidgetType {
  formula: string
  constructor(formula: string) {
    super()
    this.formula = formula
  }
  toDOM() {
    const div = document.createElement('div')
    div.className = 'cm-math-block'
    renderMath(this.formula, div, true)
    return div
  }
  eq(other: MathBlockWidget) {
    return other.formula === this.formula
  }
}

const HEADING_LEVEL: Record<string, number> = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
}

const MARK_NODES = new Set(['HeaderMark', 'EmphasisMark', 'CodeMark', 'StrikethroughMark', 'QuoteMark'])
// These marks are followed by a single space before the real content (e.g. "# " or "> ") —
// hide that space too, or a gap is left behind once the "#"/">" itself disappears.
const MARK_NODES_CONSUME_TRAILING_SPACE = new Set(['HeaderMark', 'QuoteMark'])

function skipTrailingSpace(state: EditorState, pos: number): number {
  return state.doc.sliceString(pos, pos + 1) === ' ' ? pos + 1 : pos
}

function isCheckedTaskMarker(marker: string): boolean {
  return marker.toLowerCase() === '[x]'
}

// [[Title]] / [[Title|Alias]] isn't CommonMark/GFM syntax, so the parser never produces a node
// for it — wikilinks are found with a plain regex scan instead of a syntaxTree walk.
const WIKILINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
// $$...$$ (display math, may span lines) and $...$ (inline) are LaTeX conventions, not
// CommonMark/GFM — same regex-scan approach as wikilinks. The inline pattern requires
// non-whitespace immediately inside both delimiters (Obsidian/Typora's own heuristic) so plain
// currency like "$5 and $10" doesn't get mistaken for math; block matches are found first and
// excluded from inline scanning so "$$x$$" doesn't also get read as inline math via its two
// middle '$'s.
const BLOCK_MATH_PATTERN = /\$\$([\s\S]+?)\$\$/g
const INLINE_MATH_PATTERN = /\$(?!\s)([^$\n]+?)(?<!\s)\$/g

function addWikilinkDecorations(
  state: EditorState,
  from: number,
  to: number,
  cursorLine: number,
  ranges: Range<Decoration>[],
) {
  const text = state.doc.sliceString(from, to)
  WIKILINK_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WIKILINK_PATTERN.exec(text))) {
    const matchFrom = from + match.index
    const matchTo = matchFrom + match[0].length
    if (isInsideCode(state, matchFrom)) continue
    if (state.doc.sliceString(matchFrom - 1, matchFrom) === '!') continue // an ![[embed]]

    const [, rawTitle, alias] = match
    const titleFrom = matchFrom + 2
    const titleTo = titleFrom + rawTitle.length
    const displayFrom = alias ? titleTo + 1 : titleFrom
    const displayTo = alias ? displayFrom + alias.length : titleTo

    ranges.push(
      Decoration.mark({ class: 'cm-wikilink', attributes: { 'data-wikilink-title': rawTitle.trim() } }).range(
        displayFrom,
        displayTo,
      ),
    )

    if (state.doc.lineAt(matchFrom).number !== cursorLine) {
      ranges.push(HIDE.range(matchFrom, displayFrom))
      ranges.push(HIDE.range(displayTo, matchTo))
    }
  }
}

// Scanned once per decoration build (by both the inline pass below and mathBlockDecorations)
// so inline math never re-matches a $$ block's own delimiters as a pair of inline ones.
function findBlockMathRanges(text: string): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []
  BLOCK_MATH_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = BLOCK_MATH_PATTERN.exec(text))) {
    ranges.push({ from: match.index, to: match.index + match[0].length })
  }
  return ranges
}

function addInlineMathDecorations(
  state: EditorState,
  from: number,
  to: number,
  cursorLine: number,
  ranges: Range<Decoration>[],
  blockMathRanges: { from: number; to: number }[],
) {
  const text = state.doc.sliceString(from, to)
  INLINE_MATH_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = INLINE_MATH_PATTERN.exec(text))) {
    const matchFrom = from + match.index
    const matchTo = matchFrom + match[0].length
    if (isInsideCode(state, matchFrom)) continue
    if (blockMathRanges.some((b) => matchFrom < b.to && matchTo > b.from)) continue

    if (state.doc.lineAt(matchFrom).number !== cursorLine) {
      ranges.push(Decoration.replace({ widget: new MathInlineWidget(match[1]) }).range(matchFrom, matchTo))
    }
  }
}

function addHighlightDecorations(
  state: EditorState,
  from: number,
  to: number,
  cursorLine: number,
  ranges: Range<Decoration>[],
) {
  for (const highlight of findHighlights(state.doc.sliceString(from, to))) {
    const matchFrom = from + highlight.from
    if (isInsideCode(state, matchFrom)) continue
    ranges.push(Decoration.mark({ class: 'cm-highlight' }).range(from + highlight.inner.from, from + highlight.inner.to))
    if (state.doc.lineAt(matchFrom).number !== cursorLine) {
      ranges.push(HIDE.range(matchFrom, from + highlight.inner.from))
      ranges.push(HIDE.range(from + highlight.inner.to, from + highlight.to))
    }
  }
}

// CodeMirror's own `.cm-focused` class toggling proved unreliable inside this React tree,
// so focus is tracked explicitly via React's onFocus/onBlur instead of `view.hasFocus`.
const setFocused = StateEffect.define<boolean>()
const focusedField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFocused)) return effect.value
    }
    return value
  },
})

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view
  // Only treat a line as "active" (raw markdown shown) when the editor is focused —
  // otherwise the default cursor position (offset 0) falsely keeps line 1's marks visible.
  const focused = state.field(focusedField, false)
  const cursorLine = focused ? state.doc.lineAt(state.selection.main.head).number : -1
  const ranges: Range<Decoration>[] = []
  const blockMathRanges = findBlockMathRanges(state.doc.toString())

  for (const { from, to } of view.visibleRanges) {
    addWikilinkDecorations(state, from, to, cursorLine, ranges)
    addInlineMathDecorations(state, from, to, cursorLine, ranges, blockMathRanges)
    addHighlightDecorations(state, from, to, cursorLine, ranges)

    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.type.name
        const level = HEADING_LEVEL[name]

        if (level) {
          const lineFrom = state.doc.lineAt(node.from).from
          ranges.push(Decoration.line({ class: `cm-heading cm-h${level}` }).range(lineFrom))
          return
        }

        if (name === 'HorizontalRule') {
          if (state.doc.lineAt(node.from).number !== cursorLine) {
            ranges.push(Decoration.replace({ widget: new HorizontalRuleWidget() }).range(node.from, node.to))
          }
          return
        }

        if (name === 'Image') {
          const urlNode = node.node.getChild('URL')
          const src = urlNode ? state.doc.sliceString(urlNode.from, urlNode.to) : null
          if (!src) return
          // On the cursor line the source shows *and* the image stays, below it. Swapping a tall
          // image for one line of text collapsed the page under the cursor as you arrowed onto it.
          ranges.push(
            state.doc.lineAt(node.from).number === cursorLine
              ? Decoration.widget({ widget: new ImageWidget(src), side: 1 }).range(node.to)
              : Decoration.replace({ widget: new ImageWidget(src) }).range(node.from, node.to),
          )
          return
        }

        if (name === 'FencedCode' || name === 'CodeBlock') {
          // The block keeps its background/monospace box regardless of cursor position — only
          // the fence marks (handled generically below, via MARK_NODES) hide/reveal per line.
          const startLine = state.doc.lineAt(node.from).number
          const endLine = state.doc.lineAt(node.to).number
          for (let n = startLine; n <= endLine; n++) {
            const classes = ['cm-codeblock']
            if (n === startLine) classes.push('cm-codeblock-start')
            if (n === endLine) classes.push('cm-codeblock-end')
            ranges.push(
              Decoration.line({ class: classes.join(' '), attributes: { spellcheck: 'false' } }).range(
                state.doc.line(n).from,
              ),
            )
          }
          return
        }

        if (name === 'CodeInfo') {
          ranges.push(Decoration.mark({ class: 'cm-code-lang' }).range(node.from, node.to))
          return
        }

        if (name === 'Blockquote') {
          const startLine = state.doc.lineAt(node.from).number
          const endLine = state.doc.lineAt(node.to).number
          // `> [!type] Title` makes the quote a callout: tinted lines instead of the quote bar,
          // stays live-editable (line decorations only), and its marker becomes an icon.
          const header = parseCalloutHeader(state.doc.line(startLine).text)
          for (let n = startLine; n <= endLine; n++) {
            const classes = header ? ['cm-callout', `callout-${header.type}`] : ['cm-quote']
            if (header && n === startLine) classes.push('cm-callout-start', 'cm-callout-title')
            if (header && n === endLine) classes.push('cm-callout-end')
            ranges.push(Decoration.line({ class: classes.join(' ') }).range(state.doc.line(n).from))
          }
          if (header && startLine !== cursorLine) {
            const lineFrom = state.doc.line(startLine).from
            ranges.push(
              Decoration.replace({ widget: new CalloutMarkerWidget(header.type, !header.title) }).range(
                lineFrom + header.markerFrom,
                lineFrom + header.markerTo,
              ),
            )
          }
          return
        }

        if (name === 'ListMark') {
          const item = node.node.parent
          const onCursorLine = state.doc.lineAt(node.from).number === cursorLine
          if (item?.getChild('Task')) {
            // The checkbox stands in for the whole "- [ ] " prefix.
            if (!onCursorLine) ranges.push(HIDE.range(node.from, skipTrailingSpace(state, node.to)))
          } else if (item?.parent?.type.name === 'BulletList') {
            if (!onCursorLine) ranges.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to))
          } else {
            ranges.push(Decoration.mark({ class: 'cm-list-number' }).range(node.from, node.to))
          }
          return
        }

        if (name === 'TaskMarker') {
          if (state.doc.lineAt(node.from).number !== cursorLine) {
            const checked = isCheckedTaskMarker(state.doc.sliceString(node.from, node.to))
            ranges.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to))
          }
          return
        }

        if (name === 'Task') {
          const marker = node.node.getChild('TaskMarker')
          if (marker && marker.to < node.to && isCheckedTaskMarker(state.doc.sliceString(marker.from, marker.to))) {
            ranges.push(Decoration.mark({ class: 'cm-task-done' }).range(marker.to, node.to))
          }
          return // still descends into TaskMarker and inline formatting
        }

        if (name === 'Link') {
          // Only inline [text](url) links; reference links and bare brackets have no URL child.
          const url = node.node.getChild('URL')
          const linkMarks = node.node.getChildren('LinkMark')
          if (!url || linkMarks.length < 2) return
          const textFrom = linkMarks[0].to
          const textTo = linkMarks[1].from
          if (textTo > textFrom) {
            ranges.push(
              Decoration.mark({
                class: 'cm-link',
                attributes: { 'data-href': state.doc.sliceString(url.from, url.to) },
              }).range(textFrom, textTo),
            )
          }
          if (state.doc.lineAt(node.from).number !== cursorLine) {
            ranges.push(HIDE.range(node.from, textFrom))
            ranges.push(HIDE.range(textTo, node.to))
          }
          return
        }

        if (name === 'Emphasis') {
          ranges.push(Decoration.mark({ class: 'cm-em' }).range(node.from, node.to))
          return
        }
        if (name === 'StrongEmphasis') {
          ranges.push(Decoration.mark({ class: 'cm-strong' }).range(node.from, node.to))
          return
        }
        if (name === 'InlineCode') {
          // Code isn't prose — suppress the spellcheck we otherwise enable on the editor.
          ranges.push(
            Decoration.mark({ class: 'cm-inline-code', attributes: { spellcheck: 'false' } }).range(
              node.from,
              node.to,
            ),
          )
          return
        }
        if (name === 'Strikethrough') {
          ranges.push(Decoration.mark({ class: 'cm-strike' }).range(node.from, node.to))
          return
        }

        if (MARK_NODES.has(name)) {
          const line = state.doc.lineAt(node.from).number
          if (line !== cursorLine) {
            const to = MARK_NODES_CONSUME_TRAILING_SPACE.has(name) ? skipTrailingSpace(state, node.to) : node.to
            ranges.push(HIDE.range(node.from, to))
          }
        }
      },
    })
  }

  return Decoration.set(ranges, true)
}

const liveMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate) {
      // Recompute unconditionally: a focusedField effect changes which line is "active"
      // without necessarily touching the doc, selection, or viewport.
      this.decorations = buildDecorations(update.view)
    }
  },
  { decorations: (v) => v.decorations },
)

// Tables need their own StateField: CodeMirror disallows both block decorations and decorations
// that replace a line break from being provided by a ViewPlugin (confirmed by two separate
// RangeErrors when this lived in buildDecorations/liveMarkdown above) — a table spans multiple
// lines, so it needs a StateField, unlike every single-line decoration in this file.
function buildTableDecorations(state: EditorState): DecorationSet {
  const focused = state.field(focusedField, false)
  const cursorLine = focused ? state.doc.lineAt(state.selection.main.head).number : -1
  const ranges: Range<Decoration>[] = []

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.type.name !== 'Table') return
      const startLine = state.doc.lineAt(node.from).number
      const endLine = state.doc.lineAt(node.to).number
      if (cursorLine >= startLine && cursorLine <= endLine) return

      const headerNode = node.node.getChild('TableHeader')
      if (!headerNode) return
      const header = getRowCells(state, headerNode)
      const rows = node.node.getChildren('TableRow').map((row) => getRowCells(state, row))
      ranges.push(
        Decoration.replace({ widget: new TableWidget(header, rows), block: true }).range(node.from, node.to),
      )
    },
  })

  return Decoration.set(ranges, true)
}

const tableDecorations = StateField.define<DecorationSet>({
  create: (state) => buildTableDecorations(state),
  update: (_decorations, tr) => buildTableDecorations(tr.state),
  provide: (field) => EditorView.decorations.from(field),
})

// Display math ($$...$$) needs its own StateField for the same reason as tables: it commonly
// spans multiple lines, and a ViewPlugin can't provide a decoration that replaces a line break.
function buildMathBlockDecorations(state: EditorState): DecorationSet {
  const focused = state.field(focusedField, false)
  const cursorLine = focused ? state.doc.lineAt(state.selection.main.head).number : -1
  const ranges: Range<Decoration>[] = []
  const text = state.doc.toString()

  BLOCK_MATH_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = BLOCK_MATH_PATTERN.exec(text))) {
    const from = match.index
    const to = from + match[0].length
    if (isInsideCode(state, from)) continue

    const startLine = state.doc.lineAt(from).number
    const endLine = state.doc.lineAt(to).number
    if (cursorLine >= startLine && cursorLine <= endLine) continue

    ranges.push(
      Decoration.replace({ widget: new MathBlockWidget(match[1].trim()), block: true }).range(from, to),
    )
  }

  return Decoration.set(ranges, true)
}

const mathBlockDecorations = StateField.define<DecorationSet>({
  create: (state) => buildMathBlockDecorations(state),
  update: (_decorations, tr) => buildMathBlockDecorations(tr.state),
  provide: (field) => EditorView.decorations.from(field),
})

// `:::columns` blocks span lines too, so they're a StateField like tables and display math.
function buildColumnsDecorations(state: EditorState): DecorationSet {
  const focused = state.field(focusedField, false)
  const cursorLine = focused ? state.doc.lineAt(state.selection.main.head).number : -1
  const ranges: Range<Decoration>[] = []

  for (const block of findColumnsBlocks(state.doc.toString())) {
    if (isInsideCode(state, block.from)) continue
    const startLine = state.doc.lineAt(block.from).number
    const endLine = state.doc.lineAt(block.to).number
    if (cursorLine >= startLine && cursorLine <= endLine) continue
    ranges.push(Decoration.replace({ widget: new ColumnsWidget(block), block: true }).range(block.from, block.to))
  }

  return Decoration.set(ranges, true)
}

const columnsDecorations = StateField.define<DecorationSet>({
  create: (state) => buildColumnsDecorations(state),
  update: (_decorations, tr) => buildColumnsDecorations(tr.state),
  provide: (field) => EditorView.decorations.from(field),
})

const MEDIA_KINDS = new Set(['pdf', 'video', 'audio'])

// `![[name]]` embeds resolve against attachmentsFacet, so this is a StateField too (it recomputes
// on every transaction, including the reconfigure that brings new Attachments after an upload).
// A PDF/video/audio alone on its line becomes a block player; inline, or any other kind, a link
// chip; an image, an ImageWidget like `![](url)`.
function buildEmbedDecorations(state: EditorState): DecorationSet {
  const focused = state.field(focusedField, false)
  const cursorLine = focused ? state.doc.lineAt(state.selection.main.head).number : -1
  const attachments = state.facet(attachmentsFacet)
  const collapsed = state.field(collapsedEmbeds, false)
  const ranges: Range<Decoration>[] = []

  for (const embed of findEmbeds(state.doc.toString())) {
    if (isInsideCode(state, embed.from)) continue
    const line = state.doc.lineAt(embed.from)
    // As with images: on the cursor line the source shows and an image or player stays rendered
    // below it, so arrowing onto the line doesn't collapse the page. Chips just show the source.
    const onCursorLine = line.number === cursorLine

    const attachment = resolveEmbed(embed.name, attachments)
    if (attachment?.kind === 'image') {
      const widget = new ImageWidget(attachment.url)
      ranges.push(
        onCursorLine
          ? Decoration.widget({ widget, side: 1 }).range(embed.to)
          : Decoration.replace({ widget }).range(embed.from, embed.to),
      )
    } else if (attachment && MEDIA_KINDS.has(attachment.kind) && line.text.trim() === state.doc.sliceString(embed.from, embed.to)) {
      const widget = new MediaEmbedWidget(
        attachment.kind as 'pdf' | 'video' | 'audio',
        attachment.url,
        attachment.filename,
        collapsed?.has(attachment.url) ?? false,
      )
      ranges.push(
        onCursorLine
          ? Decoration.widget({ widget, block: true, side: 1 }).range(line.to)
          : Decoration.replace({ widget, block: true }).range(line.from, line.to),
      )
    } else if (!onCursorLine) {
      const widget = new FileChipWidget(embed.name, attachment?.url ?? null)
      ranges.push(Decoration.replace({ widget }).range(embed.from, embed.to))
    }
  }

  return Decoration.set(ranges, true)
}

const embedDecorations = StateField.define<DecorationSet>({
  create: (state) => buildEmbedDecorations(state),
  update: (_decorations, tr) => buildEmbedDecorations(tr.state),
  provide: (field) => EditorView.decorations.from(field),
})

// Drives a class on the editor root from focusedField, so cursor visibility doesn't depend
// on CodeMirror's own (unreliable here) `.cm-focused` class.
const focusAttributes = EditorView.editorAttributes.of((view) => ({
  class: view.state.field(focusedField, false) ? 'cm-live-focused' : '',
}))

// @uiw/react-codemirror has no prop that reaches CM6's actual editable DOM node (unrecognized
// props land on the outer wrapper div, not .cm-content) — spellcheck has to go through an
// extension. Per-node exclusion (code shouldn't be spellchecked) is layered on top via the
// `InlineCode` decoration's own `attributes`, which most browsers respect as an override.
const spellcheckAttributes = EditorView.contentAttributes.of({ spellcheck: 'true' })

// Font size and table alignment come from AppSettings, so they vary per render — but
// EditorView.theme() mounts a real, permanent CSS rule into the document the first time each
// *object* is seen, and CodeMirror never garbage-collects a theme's rule just because a later
// reconfigure stopped using it (themes are normally a handful of stable, reused objects, e.g.
// swapped via a Compartment). Building one with `EditorView.theme({'&': {fontSize: ...}})` fresh
// per render/prop-change mounts a new orphaned rule each time, and which one wins the cascade for
// a given property becomes render-history-dependent rather than "whatever the current props are"
// — reproduced by opening a note, then changing font size in settings: two competing `.cm-table`
// rules end up in the stylesheet and the *older* one kept winning. Setting CSS custom properties
// via an inline `style` attribute instead sidesteps this entirely: editorAttributes just replaces
// an element attribute on reconfigure, with no persistent stylesheet growth, and the static
// editorTheme above reads them with `var(--note-font-size, ...)` fallbacks.
function buildDynamicAttributes(fontSize: number, tableAlign: TableAlignment) {
  return EditorView.editorAttributes.of({
    style: `--note-font-size: ${fontSize}px; --note-table-margin-x: ${tableAlign === 'center' ? 'auto' : '0px'};`,
  })
}

// Wraps (or, if the selection is already exactly wrapped, unwraps) each selected range in
// `before`/`after` markers — Cmd/Ctrl+B, +I, +E below. An empty selection just inserts both
// markers with the cursor left between them, so typing continues immediately.
function toggleWrapCommand(before: string, after: string = before) {
  return (view: EditorView): boolean => {
    view.dispatch(
      view.state.changeByRange((range) => {
        const text = view.state.sliceDoc(range.from, range.to)
        if (text.startsWith(before) && text.endsWith(after) && text.length >= before.length + after.length) {
          const inner = text.slice(before.length, text.length - after.length)
          return {
            changes: { from: range.from, to: range.to, insert: inner },
            range: EditorSelection.range(range.from, range.from + inner.length),
          }
        }
        return {
          changes: [
            { from: range.from, insert: before },
            { from: range.to, insert: after },
          ],
          range: EditorSelection.range(range.from + before.length, range.to + before.length),
        }
      }),
    )
    return true
  }
}

// Prec.highest so these take priority over basicSetup's default keymap regardless of extension
// order. Built per render from AppSettings' keybind_* fields (falling back to DEFAULT_KEYBINDS,
// the same combos this used to hardcode) rather than a module constant, so a rebind takes effect
// without reloading. Plain Mod-k is deliberately never offered as the wikilink default — it's
// Chrome/Firefox's own "focus address bar" shortcut and never reaches the page in a real browser
// tab (only worked in automated testing, which bypasses that) — but a user can still rebind onto
// it themselves if they want, since KeybindInput doesn't second-guess what they record.
function buildFormattingKeymap(keybinds: EditorKeybinds) {
  return Prec.highest(
    keymap.of([
      { key: keybinds.bold, run: toggleWrapCommand('**') },
      { key: keybinds.italic, run: toggleWrapCommand('*') },
      { key: keybinds.code, run: toggleWrapCommand('`') },
      { key: keybinds.wikilink, run: toggleWrapCommand('[[', ']]') },
    ]),
  )
}

// Matches `\word` immediately before the cursor, with the backslash preceded by start-of-line
// or whitespace (so "foo\bold" mid-prose doesn't trigger) — captures the backslash + word run,
// not the preceding whitespace.
const SLASH_TRIGGER_PATTERN = /(?:^|\s)(\\\w+)$/

// bold/link/code/image/codeblock all reduce to the same "before + after, cursor between" shape
// that toggleWrapCommand already uses for its empty-selection case — codeblock's cursor lands on
// its own blank line between the fences, ready to type code directly.
const SIMPLE_SLASH_COMMANDS: Record<string, { before: string; after: string }> = {
  bold: { before: '**', after: '**' },
  link: { before: '[[', after: ']]' },
  code: { before: '`', after: '`' },
  codeblock: { before: '```\n', after: '\n```' },
  image: { before: '![', after: ']()' },
}

// Space/Enter handler for \bold, \link, \code, \codeblock, \image, \table<N>x<M>. A single
// dispatch both deletes the `\word` span and inserts the replacement, so one undo step reverts
// it fully.
function runSlashCommand(view: EditorView): boolean {
  const { state } = view
  const { main } = state.selection
  if (!main.empty) return false // only a single empty cursor triggers expansion

  const pos = main.head
  const line = state.doc.lineAt(pos)
  const match = SLASH_TRIGGER_PATTERN.exec(line.text.slice(0, pos - line.from))
  if (!match) return false

  const token = match[1] // e.g. "\bold" or "\table3x4"
  const matchFrom = pos - token.length
  if (isInsideCode(state, matchFrom)) return false

  const word = token.slice(1).toLowerCase()

  const simple = SIMPLE_SLASH_COMMANDS[word]
  if (simple) {
    view.dispatch({
      changes: { from: matchFrom, to: pos, insert: simple.before + simple.after },
      selection: EditorSelection.cursor(matchFrom + simple.before.length),
    })
    return true
  }

  const table = parseTableShorthand(word)
  if (table) {
    const { text, selectFrom, selectTo } = buildTableMarkdown(table.cols, table.rows)
    view.dispatch({
      changes: { from: matchFrom, to: pos, insert: text },
      selection: EditorSelection.range(matchFrom + selectFrom, matchFrom + selectTo),
    })
    return true
  }

  return false
}

// Fixed command set, not user-configurable (unlike buildFormattingKeymap's keybinds), so this
// is a stable module-level constant rather than rebuilt per render. Prec.highest for the same
// reason buildFormattingKeymap uses it: wins over basicSetup's default Space/Enter handling, but
// only when a command actually matched — returns false otherwise, so normal typing, newlines,
// and markdown list continuation on Enter are completely unaffected.
const slashCommandKeymap = Prec.highest(
  keymap.of([
    { key: 'Space', run: runSlashCommand },
    { key: 'Enter', run: runSlashCommand },
  ]),
)

const INSERT_BLOCK_EVENT = 'input.block'
// Edits that aren't typing and may happen while unfocused, so they're saved straight away.
const COMMIT_USER_EVENTS = [TOGGLE_TASK_EVENT, INSERT_BLOCK_EVENT, UPLOAD_EVENT]

// Only schemes that are safe to hand to window.open; `javascript:` and friends are ignored.
const OPENABLE_HREF = /^(https?:|mailto:)/i

// Cmd/Ctrl+click follows a wikilink (in-app) or a web link (new tab / system browser).
function linkClickHandler(onNavigateWikilink?: (title: string) => void) {
  return (event: MouseEvent) => {
    if (!(event.metaKey || event.ctrlKey)) return false
    const target = event.target
    if (!(target instanceof HTMLElement)) return false

    const wikilink = target.closest<HTMLElement>('[data-wikilink-title]')
    if (wikilink?.dataset.wikilinkTitle && onNavigateWikilink) {
      event.preventDefault()
      onNavigateWikilink(wikilink.dataset.wikilinkTitle)
      return true
    }

    const href = target.closest<HTMLElement>('[data-href]')?.dataset.href
    if (href && OPENABLE_HREF.test(href)) {
      event.preventDefault()
      window.open(href, '_blank', 'noopener,noreferrer')
      return true
    }
    return false
  }
}

export interface MarkdownEditorHandle {
  /** Opens the block builder, inserting at the cursor (or the end, if never focused). */
  openBlockDialog: () => void
}

const NO_ATTACHMENTS: readonly Attachment[] = []

export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  sourceMode,
  placeholder,
  autoFocus,
  className,
  minHeight,
  onNavigateWikilink,
  fontSize = 15,
  tableAlign = 'left',
  keybinds = DEFAULT_KEYBINDS,
  onCommit,
  attachments = NO_ATTACHMENTS,
  onUploadFile,
  foldStorageKey,
  ref,
}: {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  sourceMode: boolean
  placeholder?: string
  autoFocus?: boolean
  className?: string
  minHeight?: string
  onNavigateWikilink?: (title: string) => void
  /** From AppSettings.note_font_size, in px. */
  fontSize?: number
  /** From AppSettings.table_alignment. */
  tableAlign?: TableAlignment
  /** From AppSettings.keybind_*. */
  keybinds?: EditorKeybinds
  /**
   * Called right after an edit that isn't typing (a checklist tick, an inserted block, a finished
   * upload), so it can be saved now. Those can happen while the editor is unfocused, so no blur
   * would follow.
   */
  onCommit?: () => void
  /** The note's Attachments: what `![[name]]` embeds resolve against and the pickers list. */
  attachments?: readonly Attachment[]
  /**
   * Uploads a file as one of the note's Attachments, resolving once `attachments` includes it.
   * Without it, paste/drop of files falls through to CodeMirror and the pickers can't upload.
   */
  onUploadFile?: (file: File) => Promise<Attachment>
  /** Remembers this note's folded headings and collapsed embeds in the browser under this key. */
  foldStorageKey?: string
  ref?: Ref<MarkdownEditorHandle>
}) {
  const viewRef = useRef<EditorView | null>(null)
  const [dialog, setDialog] = useState<EditorDialog | null>(null)
  // Kept while the picker animates closed, so its title doesn't flip mid-fade.
  const [pickerMode, setPickerMode] = useState<PickerMode>('image')
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Where a dialog's block goes: the cursor when it opened. Until the note is first focused the
  // selection is just offset 0, so the block goes at the end instead of above everything.
  const blockInsertPos = useRef(0)
  const everFocused = useRef(false)

  function openDialog(kind: EditorDialog) {
    const view = viewRef.current
    if (!view) return
    blockInsertPos.current = everFocused.current ? view.state.selection.main.head : view.state.doc.length
    if (kind !== 'block') setPickerMode(kind)
    setDialog(kind)
  }

  useImperativeHandle(ref, () => ({ openBlockDialog: () => openDialog('block') }))

  useEffect(() => {
    if (!uploadError) return
    const timeout = setTimeout(() => setUploadError(null), 6000)
    return () => clearTimeout(timeout)
  }, [uploadError])

  // A block always gets its own lines with a blank line above: in place on a blank line, else
  // after the cursor's line. The trailing newline leaves the cursor on a fresh line below it, so
  // the block renders straight away (and a following paragraph can't lazily join a callout).
  function insertBlock(markdown: string) {
    const view = viewRef.current
    if (!view) return
    const { doc } = view.state
    const line = doc.lineAt(Math.min(blockInsertPos.current, doc.length))
    const blank = line.text.trim() === ''
    const blankAbove = line.number === 1 || doc.line(line.number - 1).text.trim() === ''
    const from = blank ? line.from : line.to
    const prefix = blank ? (blankAbove ? '' : '\n') : '\n\n'
    const text = `${prefix}${markdown}\n`
    view.dispatch({
      changes: { from, to: line.to, insert: text },
      selection: EditorSelection.cursor(from + text.length),
      scrollIntoView: true,
      userEvent: INSERT_BLOCK_EVENT,
    })
  }

  async function upload(file: File) {
    if (!onUploadFile) throw new Error('Uploading isn\'t available here.')
    return onUploadFile(file)
  }

  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null)
  }
  // Back to the note to keep typing (inserts themselves are saved through onCommit).
  const refocusEditor = () => viewRef.current?.focus()

  // Clicking (especially on an empty line) can fire several synchronous focus/blur events
  // in a row before settling. Debounce so only the final state reaches the view — dispatching
  // on every intermediate event was itself feeding the thrashing (each dispatch recomputes
  // decorations, which can retrigger a blur).
  const settleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleFocusUpdate(focused: boolean) {
    if (settleTimeout.current) clearTimeout(settleTimeout.current)
    settleTimeout.current = setTimeout(() => {
      settleTimeout.current = null
      viewRef.current?.dispatch({ effects: setFocused.of(focused) })
      if (!focused) onBlur?.()
    }, 0)
  }

  return (
    <>
      <CodeMirror
        value={value}
        onChange={onChange}
        onCreateEditor={(view) => {
          viewRef.current = view
          const snapshot = foldStorageKey ? loadFoldSnapshot(foldStorageKey) : null
          if (snapshot) restoreFolds(view, snapshot)
        }}
        onUpdate={(update) => {
          for (const tr of update.transactions) {
            for (const effect of tr.effects) if (effect.is(openDialogEffect)) openDialog(effect.value)
          }
          if (update.transactions.some((tr) => COMMIT_USER_EVENTS.some((event) => tr.isUserEvent(event)))) {
            onCommit?.()
          }
        }}
        onFocus={() => {
          everFocused.current = true
          scheduleFocusUpdate(true)
        }}
        onBlur={() => scheduleFocusUpdate(false)}
        autoFocus={autoFocus}
        placeholder={placeholder}
        minHeight={minHeight}
        theme="none"
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          autocompletion: false,
          syntaxHighlighting: false,
        }}
        extensions={[
          markdown({ extensions: GFM }),
          EditorView.lineWrapping,
          editorTheme,
          buildDynamicAttributes(fontSize, tableAlign),
          spellcheckAttributes,
          buildFormattingKeymap(keybinds),
          slashCommandKeymap,
          slashMenu,
          attachmentsFacet.of(attachments),
          fileDropHandlers(() => (onUploadFile ? { upload: onUploadFile, onError: setUploadError } : null)),
          // A blank line gives the eye nothing else to anchor on, so a blinking cursor reads as
          // "gone" far more often there than on a line with text next to it — just keep it solid.
          drawSelection({ cursorBlinkRate: 0 }),
          folding(foldStorageKey),
          ...(sourceMode
            ? []
            : [
                focusedField,
                liveMarkdown,
                tableDecorations,
                mathBlockDecorations,
                columnsDecorations,
                embedDecorations,
                focusAttributes,
                EditorView.domEventHandlers({ click: linkClickHandler(onNavigateWikilink) }),
              ]),
        ]}
        className={className}
      />
      <InsertBlockDialog
        open={dialog === 'block'}
        onOpenChange={closeDialog}
        onInsert={insertBlock}
        onClosed={refocusEditor}
        attachments={attachments}
        upload={onUploadFile ? upload : undefined}
      />
      <AttachmentPickerDialog
        mode={pickerMode}
        open={dialog === 'image' || dialog === 'file'}
        onOpenChange={closeDialog}
        attachments={attachments}
        upload={upload}
        onPick={(attachment) => insertBlock(attachmentMarkdown(attachment))}
        onClosed={refocusEditor}
      />
      {uploadError && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-popover px-4 py-2 text-sm text-destructive shadow-lg"
        >
          {uploadError}
        </div>
      )}
    </>
  )
}
