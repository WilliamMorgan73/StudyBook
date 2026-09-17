import { GFM } from '@lezer/markdown'
import CodeMirror, { Decoration, EditorView, type DecorationSet, type Range } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxTree } from '@codemirror/language'
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

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view
  const cursorLine = state.doc.lineAt(state.selection.main.head).number
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
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

const editorTheme = EditorView.theme({
  '&': { fontSize: '0.9375rem', backgroundColor: 'transparent' },
  '.cm-content': { padding: 0, fontFamily: 'var(--font-sans)', caretColor: 'var(--foreground)' },
  '.cm-line': { padding: 0 },
  '&.cm-editor.cm-focused': { outline: 'none' },
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
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      onBlur={onBlur}
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
        ...(sourceMode ? [] : [liveMarkdown]),
      ]}
      className={className}
    />
  )
}
