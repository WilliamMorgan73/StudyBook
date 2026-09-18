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
import { useRef } from 'react'
import { drawSelection, keymap, ViewPlugin, WidgetType, type ViewUpdate } from '@codemirror/view'

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

class ImageWidget extends WidgetType {
  src: string
  constructor(src: string) {
    super()
    this.src = src
  }
  toDOM() {
    const img = document.createElement('img')
    img.className = 'cm-image'
    img.src = this.src
    return img
  }
  eq(other: ImageWidget) {
    return other.src === this.src
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

// [[Title]] / [[Title|Alias]] isn't CommonMark/GFM syntax, so the parser never produces a node
// for it — wikilinks are found with a plain regex scan instead of a syntaxTree walk.
const WIKILINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
const CODE_NODE_NAMES = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText'])

interface WalkableNode {
  type: { name: string }
  parent: WalkableNode | null
}

function isInsideCode(state: EditorState, pos: number): boolean {
  let node: WalkableNode | null = syntaxTree(state).resolveInner(pos, 1)
  while (node) {
    if (CODE_NODE_NAMES.has(node.type.name)) return true
    node = node.parent
  }
  return false
}

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

  for (const { from, to } of view.visibleRanges) {
    addWikilinkDecorations(state, from, to, cursorLine, ranges)

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
          if (state.doc.lineAt(node.from).number !== cursorLine) {
            const urlNode = node.node.getChild('URL')
            const src = urlNode ? state.doc.sliceString(urlNode.from, urlNode.to) : null
            if (src) {
              ranges.push(Decoration.replace({ widget: new ImageWidget(src) }).range(node.from, node.to))
            }
          }
          return
        }

        if (name === 'Blockquote') {
          const startLine = state.doc.lineAt(node.from).number
          const endLine = state.doc.lineAt(node.to).number
          for (let n = startLine; n <= endLine; n++) {
            ranges.push(Decoration.line({ class: 'cm-quote' }).range(state.doc.line(n).from))
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

const editorTheme = EditorView.theme({
  // @uiw/react-codemirror's own dimension theme sets `min-height` on `&` (.cm-editor) for the
  // `minHeight` prop, but relies on `.cm-scroller { height: 100% }` to fill it — a percentage
  // height can't resolve against an ancestor whose height comes only from min-height (not a
  // definite `height`), so .cm-scroller silently collapses to content size on short documents.
  // That mismatch (a tall .cm-editor, a short .cm-scroller) is what made the cursor-drawing
  // layer compute a degenerate zero-size rect — invisible cursor — reproduced on any line, not
  // just blank ones (blank lines just make an invisible cursor more noticeable, with nothing
  // else on the line to anchor the eye). Flex with an explicit flex-basis sidesteps the
  // percentage-height resolution issue entirely, regardless of how .cm-editor's height was set.
  '&': { fontSize: '0.9375rem', backgroundColor: 'transparent', display: 'flex', flexDirection: 'column' },
  '.cm-scroller': { flex: '1 1 0px', minHeight: 0 },
  '.cm-content': { padding: 0, fontFamily: 'var(--font-sans)' },
  '.cm-line': { padding: 0 },
  '&.cm-editor.cm-focused': { outline: 'none' },
  '&.cm-live-focused .cm-cursor, &.cm-live-focused .cm-dropCursor': {
    display: 'block',
    // `drawSelection({ cursorBlinkRate: 0 })` sets `animation-duration: 0ms` on the cursor's
    // `cm-blink` keyframe animation (steps(1), infinite) rather than removing it — whether a
    // zero-duration infinite step animation resolves to its visible or invisible keyframe is a
    // browser-specific edge case (`@keyframes cm-blink` toggles opacity at its 50% step), so
    // relying on duration alone was fragile. `animation: none` removes the animation outright,
    // guaranteeing a static, always-visible cursor regardless of that resolution.
    animation: 'none',
    opacity: 1,
    borderLeftColor: 'var(--foreground)',
    borderLeftWidth: '2px',
  },
  '.cm-hr': {
    display: 'block',
    height: 0,
    margin: '0.6em 0',
    borderTop: '1px solid var(--border)',
  },
  '.cm-image': {
    display: 'block',
    maxWidth: '100%',
    borderRadius: '0.5rem',
    margin: '0.4em 0',
  },
  '.cm-heading': { fontWeight: '600' },
  '.cm-h1': { fontSize: '1.6em' },
  '.cm-h2': { fontSize: '1.35em' },
  '.cm-h3': { fontSize: '1.15em' },
  '.cm-h4, .cm-h5, .cm-h6': { fontSize: '1em' },
  '.cm-em': { fontStyle: 'italic' },
  '.cm-strong': { fontWeight: '600' },
  '.cm-strike': { textDecoration: 'line-through' },
  '.cm-inline-code': {
    fontFamily: 'ui-monospace, monospace',
    fontSize: '0.875em',
    backgroundColor: 'var(--muted)',
    borderRadius: '0.25rem',
    padding: '0.05em 0.3em',
  },
  '.cm-quote': {
    borderLeft: '2px solid var(--border)',
    paddingLeft: '0.75rem',
    color: 'var(--muted-foreground)',
  },
  '.cm-wikilink': {
    textDecoration: 'underline',
    textDecorationColor: 'var(--border)',
    textUnderlineOffset: '2px',
    cursor: 'pointer',
  },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
})

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

// Prec.highest so these take priority over basicSetup's default keymap regardless of extension order.
const formattingKeymap = Prec.highest(
  keymap.of([
    { key: 'Mod-b', run: toggleWrapCommand('**') },
    { key: 'Mod-i', run: toggleWrapCommand('*') },
    { key: 'Mod-e', run: toggleWrapCommand('`') },
    // Plain Mod-k is Chrome/Firefox's own "focus address bar" shortcut and never reaches the
    // page in a real browser tab (only worked in automated testing, which bypasses that).
    { key: 'Mod-Shift-k', run: toggleWrapCommand('[[', ']]') },
  ]),
)

function wikilinkClickHandler(onNavigateWikilink?: (title: string) => void) {
  return (event: MouseEvent) => {
    if (!onNavigateWikilink || !(event.metaKey || event.ctrlKey)) return false
    const target = event.target
    const link = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-wikilink-title]') : null
    if (!link?.dataset.wikilinkTitle) return false
    event.preventDefault()
    onNavigateWikilink(link.dataset.wikilinkTitle)
    return true
  }
}

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
}) {
  const viewRef = useRef<EditorView | null>(null)
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
    <CodeMirror
      value={value}
      onChange={onChange}
      onCreateEditor={(view) => {
        viewRef.current = view
      }}
      onFocus={() => scheduleFocusUpdate(true)}
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
        spellcheckAttributes,
        formattingKeymap,
        // A blank line gives the eye nothing else to anchor on, so a blinking cursor reads as
        // "gone" far more often there than on a line with text next to it — just keep it solid.
        drawSelection({ cursorBlinkRate: 0 }),
        ...(sourceMode
          ? []
          : [
              focusedField,
              liveMarkdown,
              focusAttributes,
              EditorView.domEventHandlers({ click: wikilinkClickHandler(onNavigateWikilink) }),
            ]),
      ]}
      className={className}
    />
  )
}
