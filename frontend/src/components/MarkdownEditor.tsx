import { GFM } from '@lezer/markdown'
import CodeMirror, {
  Decoration,
  EditorView,
  StateEffect,
  StateField,
  type DecorationSet,
  type Range,
} from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxTree } from '@codemirror/language'
import { useRef } from 'react'
import { ViewPlugin, type ViewUpdate } from '@codemirror/view'

const HIDE = Decoration.replace({})

const HEADING_LEVEL: Record<string, number> = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
}

const MARK_NODES = new Set(['HeaderMark', 'EmphasisMark', 'CodeMark', 'StrikethroughMark', 'QuoteMark'])

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
          ranges.push(Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to))
          return
        }
        if (name === 'Strikethrough') {
          ranges.push(Decoration.mark({ class: 'cm-strike' }).range(node.from, node.to))
          return
        }

        if (MARK_NODES.has(name)) {
          const line = state.doc.lineAt(node.from).number
          if (line !== cursorLine) ranges.push(HIDE.range(node.from, node.to))
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

const editorTheme = EditorView.theme({
  '&': { fontSize: '0.9375rem', backgroundColor: 'transparent' },
  '.cm-content': { padding: 0, fontFamily: 'var(--font-sans)' },
  '.cm-line': { padding: 0 },
  '&.cm-editor.cm-focused': { outline: 'none' },
  '.cm-live-focused .cm-cursor, .cm-live-focused .cm-dropCursor': {
    display: 'block',
    borderLeftColor: 'var(--foreground)',
    borderLeftWidth: '1.5px',
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
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
})

export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  sourceMode,
  placeholder,
  autoFocus,
  className,
  minHeight,
}: {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  sourceMode: boolean
  placeholder?: string
  autoFocus?: boolean
  className?: string
  minHeight?: string
}) {
  const viewRef = useRef<EditorView | null>(null)

  function markFocused(focused: boolean) {
    viewRef.current?.dispatch({ effects: setFocused.of(focused) })
  }

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      onCreateEditor={(view) => {
        viewRef.current = view
      }}
      onFocus={() => markFocused(true)}
      onBlur={() => {
        markFocused(false)
        onBlur?.()
      }}
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
        ...(sourceMode ? [] : [focusedField, liveMarkdown, focusAttributes]),
      ]}
      className={className}
    />
  )
}
