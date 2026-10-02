// Pure markdown helpers for MarkdownEditor: the `/` command set and the regex-scanned syntax that
// has no Lezer node. Kept free of CodeMirror so it can be unit tested.

// `==text==` isn't CommonMark/GFM. Like inline math, it needs non-whitespace just inside both
// delimiters, so "a == b" in prose stays text.
export const HIGHLIGHT_PATTERN = /==(?!\s)([^=\n]+?)(?<!\s)==/g

export interface TextRange {
  from: number
  to: number
}

/** `==text==` spans in `text`, with offsets relative to it. `inner` excludes the delimiters. */
export function findHighlights(text: string): { from: number; to: number; inner: TextRange }[] {
  const found: { from: number; to: number; inner: TextRange }[] = []
  HIGHLIGHT_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = HIGHLIGHT_PATTERN.exec(text))) {
    const from = match.index
    const to = from + match[0].length
    found.push({ from, to, inner: { from: from + 2, to: to - 2 } })
  }
  return found
}

// A cell that's entirely whitespace never gets a TableCell node from @lezer/markdown's table
// parser, so an empty data cell would vanish from the rendered row. A zero-width space keeps the
// cell invisible but parseable, and survives `.trim()` (U+200B is a Format character, not a space).
export const EMPTY_CELL = '​'
export const MAX_TABLE_DIMENSION = 12

/**
 * N columns and M *data* rows; the header row and its `---` divider come in addition to M.
 * `selectFrom`/`selectTo` cover "Header 1", ready to overwrite.
 */
export function buildTableMarkdown(cols: number, rows: number): { text: string; selectFrom: number; selectTo: number } {
  const header = `| ${Array.from({ length: cols }, (_, i) => `Header ${i + 1}`).join(' | ')} |`
  const divider = `| ${Array(cols).fill('---').join(' | ')} |`
  const dataRow = `| ${Array(cols).fill(EMPTY_CELL).join(' | ')} |`
  const text = [header, divider, ...Array(rows).fill(dataRow)].join('\n')
  return { text, selectFrom: 2, selectTo: 2 + 'Header 1'.length }
}

/**
 * What a command inserts. The cursor lands between `before` and `after`, or `select` (offsets into
 * `before + after`) is selected instead. A `block` command must start its own line, so it gets a
 * leading newline when typed after text.
 */
export interface SlashInsert {
  before: string
  after: string
  block?: boolean
  select?: TextRange
}

export interface SlashCommand {
  id: string
  label: string
  detail?: string
  keywords?: string[]
  insert: SlashInsert
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'list', label: 'Bullet list', keywords: ['ul', 'bullet'], insert: { before: '- ', after: '', block: true } },
  { id: 'numbered', label: 'Numbered list', keywords: ['ol', 'ordered'], insert: { before: '1. ', after: '', block: true } },
  {
    id: 'checklist',
    label: 'Checklist',
    keywords: ['todo', 'task', 'list'],
    insert: { before: '- [ ] ', after: '', block: true },
  },
  { id: 'h1', label: 'Heading 1', keywords: ['heading', 'title'], insert: { before: '# ', after: '', block: true } },
  { id: 'h2', label: 'Heading 2', keywords: ['heading'], insert: { before: '## ', after: '', block: true } },
  { id: 'h3', label: 'Heading 3', keywords: ['heading'], insert: { before: '### ', after: '', block: true } },
  { id: 'quote', label: 'Quote', keywords: ['blockquote'], insert: { before: '> ', after: '', block: true } },
  { id: 'divider', label: 'Divider', keywords: ['hr', 'rule', 'line'], insert: { before: '---\n', after: '', block: true } },
  { id: 'codeblock', label: 'Code block', keywords: ['fence'], insert: { before: '```\n', after: '\n```', block: true } },
  { id: 'math', label: 'Math block', keywords: ['latex', 'equation'], insert: { before: '$$\n', after: '\n$$', block: true } },
  {
    id: 'table',
    label: 'Table',
    detail: '3 × 3, or type table4x2',
    keywords: ['grid'],
    insert: tableInsert(3, 3),
  },
  { id: 'bold', label: 'Bold', keywords: ['strong'], insert: { before: '**', after: '**' } },
  { id: 'highlight', label: 'Highlight', keywords: ['mark'], insert: { before: '==', after: '==' } },
  { id: 'code', label: 'Inline code', keywords: ['monospace'], insert: { before: '`', after: '`' } },
  { id: 'wikilink', label: 'Note link', detail: '[[Title]]', keywords: ['wikilink', 'link'], insert: { before: '[[', after: ']]' } },
  {
    id: 'link',
    label: 'Web link',
    detail: '[text](url)',
    keywords: ['url', 'href'],
    insert: { before: '[', after: '](https://)' },
  },
  { id: 'image', label: 'Image', detail: '![](url)', keywords: ['picture', 'img'], insert: { before: '![', after: ']()' } },
]

function tableInsert(cols: number, rows: number): SlashInsert {
  const { text, selectFrom, selectTo } = buildTableMarkdown(cols, rows)
  return { before: text, after: '', block: true, select: { from: selectFrom, to: selectTo } }
}

const DYNAMIC_TABLE_PATTERN = /^table(\d+)x(\d+)$/

/** The `\table<N>x<M>` / `/table<N>x<M>` shorthand, or null if out of range or not a table. */
export function parseTableShorthand(word: string): { cols: number; rows: number } | null {
  const match = DYNAMIC_TABLE_PATTERN.exec(word.toLowerCase())
  if (!match) return null
  const cols = Number(match[1])
  const rows = Number(match[2])
  if (cols < 1 || rows < 1 || cols > MAX_TABLE_DIMENSION || rows > MAX_TABLE_DIMENSION) return null
  return { cols, rows }
}

/**
 * Commands matching what's typed after `/`, in menu order. A word of the label, the id or a
 * keyword must start with the query. `table4x2` yields a sized table instead.
 */
export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase()
  const table = parseTableShorthand(q)
  if (table) {
    return [
      {
        id: `table${table.cols}x${table.rows}`,
        label: `Table ${table.cols} × ${table.rows}`,
        insert: tableInsert(table.cols, table.rows),
      },
    ]
  }
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter((command) =>
    [command.id, ...command.label.toLowerCase().split(/\s+/), ...(command.keywords ?? [])].some((word) =>
      word.startsWith(q),
    ),
  )
}

// A line holding only a list/checklist/quote marker, e.g. an Enter-continued "- [ ] ". A block
// command typed there replaces the marker instead of leaving it behind as an empty item.
const BARE_MARKER_LINE = /^(\s*)(?:(?:[-*+]|\d+[.)])(?:\s+\[[ xX]\])?|>)\s*$/

/**
 * How to replace the typed `/query`. `textBefore` is the line's text before the `/`;
 * `replaceBack` is how many of its trailing characters the insert also replaces, and `selection`
 * is relative to the start of the replaced range.
 */
export function planSlashInsert(
  insert: SlashInsert,
  textBefore: string,
): { replaceBack: number; text: string; selection: TextRange } {
  let replaceBack = 0
  let prefix = ''
  if (insert.block) {
    const bare = BARE_MARKER_LINE.exec(textBefore)
    if (bare) {
      replaceBack = textBefore.length - bare[1].length // keep indentation, drop the marker
    } else if (textBefore.trim() !== '') {
      replaceBack = textBefore.length - textBefore.trimEnd().length // no trailing space left behind
      prefix = '\n'
    }
  }
  const text = prefix + insert.before + insert.after
  const selection = insert.select
    ? { from: prefix.length + insert.select.from, to: prefix.length + insert.select.to }
    : { from: prefix.length + insert.before.length, to: prefix.length + insert.before.length }
  return { replaceBack, text, selection }
}
