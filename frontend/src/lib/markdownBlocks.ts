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
export const EMPTY_CELL = '\u200B'
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

export const CALLOUT_TYPES = ['note', 'tip', 'warning', 'definition', 'example'] as const
export type CalloutType = (typeof CALLOUT_TYPES)[number]

export const CALLOUT_LABELS: Record<CalloutType, string> = {
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
  definition: 'Definition',
  example: 'Example',
}

// Obsidian's callout header: the first line of a blockquote, `> [!type] Optional title`.
const CALLOUT_HEADER = /^\s*>\s*\[!(\w+)\][ \t]*(.*)$/

/**
 * The callout a blockquote's first line declares, or null for a plain quote. `type` is lowercased
 * and an unknown one falls back to `note`, as Obsidian does. `markerFrom`/`markerTo` cover
 * `[!type]` plus the space after it, as offsets into `line`.
 */
export function parseCalloutHeader(
  line: string,
): { type: CalloutType; title: string; markerFrom: number; markerTo: number } | null {
  const match = CALLOUT_HEADER.exec(line)
  if (!match) return null
  const raw = match[1].toLowerCase()
  const type = (CALLOUT_TYPES as readonly string[]).includes(raw) ? (raw as CalloutType) : 'note'
  const markerFrom = line.indexOf('[!')
  const markerTo = line.length - match[2].length
  return { type, title: match[2].trim(), markerFrom, markerTo }
}

export function buildCalloutMarkdown(type: CalloutType, title: string, body: string): string {
  const header = `> [!${type}]${title.trim() ? ` ${title.trim()}` : ''}`
  if (!body.trim()) return header
  return [header, ...body.trimEnd().split('\n').map((line) => (line ? `> ${line}` : '>'))].join('\n')
}

// The two-column block: main text on the left, a titled side box on the right.
//
//   :::columns
//   main markdown
//   :::side Optional title
//   side markdown
//   :::
//
// Not CommonMark; the delimiter lines read as plain paragraphs anywhere else.
export interface ColumnsBlock {
  /** Offsets of the whole block, from the `:::columns` line start to the closing `:::` line end. */
  from: number
  to: number
  main: string
  sideTitle: string
  side: string
}

const COLUMNS_OPEN = /^:::columns\s*$/
const COLUMNS_SIDE = /^:::side(?:[ \t]+(.*))?$/
const COLUMNS_CLOSE = /^:::\s*$/

/**
 * Every complete `:::columns` block in `text`. One missing its `:::side` or closing `:::` isn't a
 * block (it stays raw while being typed); nesting isn't supported.
 */
export function findColumnsBlocks(text: string): ColumnsBlock[] {
  const blocks: ColumnsBlock[] = []
  const lines = text.split('\n')
  const starts: number[] = []
  let offset = 0
  for (const line of lines) {
    starts.push(offset)
    offset += line.length + 1
  }

  let i = 0
  while (i < lines.length) {
    if (!COLUMNS_OPEN.test(lines[i].trimEnd())) {
      i++
      continue
    }
    let sideLine = -1
    let closeLine = -1
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j].trimEnd()
      if (COLUMNS_OPEN.test(line)) break // another opener first: this one is unclosed
      if (sideLine === -1 && COLUMNS_SIDE.test(line)) sideLine = j
      else if (sideLine !== -1 && COLUMNS_CLOSE.test(line)) {
        closeLine = j
        break
      }
    }
    if (sideLine === -1 || closeLine === -1) {
      i++
      continue
    }
    blocks.push({
      from: starts[i],
      to: starts[closeLine] + lines[closeLine].length,
      main: lines.slice(i + 1, sideLine).join('\n').trim(),
      sideTitle: (COLUMNS_SIDE.exec(lines[sideLine].trimEnd())?.[1] ?? '').trim(),
      side: lines.slice(sideLine + 1, closeLine).join('\n').trim(),
    })
    i = closeLine + 1
  }
  return blocks
}

export function buildColumnsMarkdown(main: string, sideTitle: string, side: string): string {
  const sideHeader = `:::side${sideTitle.trim() ? ` ${sideTitle.trim()}` : ''}`
  return [':::columns', main.trim(), sideHeader, side.trim(), ':::'].join('\n')
}

// `![[file.pdf]]` embeds one of the note's Attachments by filename (Obsidian syntax). An optional
// `|...` suffix (Obsidian's sizing) is accepted and ignored.
const EMBED_PATTERN = /!\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]/g

export interface EmbedMatch {
  from: number
  to: number
  name: string
}

export function findEmbeds(text: string): EmbedMatch[] {
  const found: EmbedMatch[] = []
  EMBED_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = EMBED_PATTERN.exec(text))) {
    found.push({ from: match.index, to: match.index + match[0].length, name: match[1].trim() })
  }
  return found
}

/** The attachment an embed names: exact filename first, else case-insensitive; first wins. */
export function resolveEmbed<T extends { filename: string }>(name: string, attachments: readonly T[]): T | null {
  return (
    attachments.find((a) => a.filename === name) ??
    attachments.find((a) => a.filename.toLowerCase() === name.toLowerCase()) ??
    null
  )
}

/** Markdown for an attachment: images inline by URL (unique even for repeat "image.png" pastes), anything else as an embed. */
export function attachmentMarkdown(attachment: { kind: string; filename: string; url: string }): string {
  return attachment.kind === 'image' ? `![](${attachment.url})` : `![[${attachment.filename}]]`
}

// Browsers name every clipboard image "image.png", which makes pasted Attachments
// indistinguishable; they get a timestamped name instead, as in Obsidian.
const CLIPBOARD_IMAGE_NAME = /^image\.(png|jpe?g|gif|webp)$/i

/** `Pasted image 2026-10-02 112530.png` for a browser's generic clipboard image name, else null. */
export function pastedImageName(filename: string, now: Date): string | null {
  const match = CLIPBOARD_IMAGE_NAME.exec(filename)
  if (!match) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `Pasted image ${date} ${time}.${match[1].toLowerCase()}`
}

/** Dialogs a `/` command can open instead of inserting text. */
export type EditorDialog = 'block' | 'image' | 'file'

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
  /** The one-word name typed after `/`, shown in the menu (e.g. `heading2`). */
  id: string
  /** Instead of inserting text, removes the typed `/query` and opens this editor dialog. */
  action?: EditorDialog
  label: string
  /** Menu hint; defaults to `/id`. */
  detail?: string
  keywords?: string[]
  insert: SlashInsert
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'bulletlist', label: 'Bullet list', keywords: ['ul', 'list'], insert: { before: '- ', after: '', block: true } },
  {
    id: 'numberedlist',
    label: 'Numbered list',
    keywords: ['ol', 'ordered', 'list'],
    insert: { before: '1. ', after: '', block: true },
  },
  {
    id: 'checklist',
    label: 'Checklist',
    keywords: ['todo', 'task', 'list'],
    insert: { before: '- [ ] ', after: '', block: true },
  },
  { id: 'heading1', label: 'Heading 1', keywords: ['h1', 'title'], insert: { before: '# ', after: '', block: true } },
  { id: 'heading2', label: 'Heading 2', keywords: ['h2'], insert: { before: '## ', after: '', block: true } },
  { id: 'heading3', label: 'Heading 3', keywords: ['h3'], insert: { before: '### ', after: '', block: true } },
  { id: 'quote', label: 'Quote', keywords: ['blockquote'], insert: { before: '> ', after: '', block: true } },
  ...CALLOUT_TYPES.map(
    (type): SlashCommand => ({
      id: `${type}callout`,
      label: `${CALLOUT_LABELS[type]} callout`,
      keywords: ['callout', 'box'],
      insert: { before: `> [!${type}] `, after: '', block: true },
    }),
  ),
  {
    id: 'sidebox',
    label: 'Side box',
    keywords: ['columns', 'aside', 'box', 'sidebar'],
    insert: { before: ':::columns\n', after: '\n:::side Key points\n- \n:::', block: true },
  },
  {
    id: 'block',
    label: 'Block…',
    keywords: ['insert', 'callout', 'box', 'builder'],
    insert: { before: '', after: '' },
    action: 'block',
  },
  {
    id: 'image',
    label: 'Image…',
    keywords: ['picture', 'img', 'photo', 'upload'],
    insert: { before: '', after: '' },
    action: 'image',
  },
  {
    id: 'embed',
    label: 'Embed file…',
    keywords: ['pdf', 'file', 'attachment', 'upload'],
    insert: { before: '', after: '' },
    action: 'file',
  },
  { id: 'divider', label: 'Divider', keywords: ['hr', 'rule', 'line'], insert: { before: '---\n', after: '', block: true } },
  { id: 'codeblock', label: 'Code block', keywords: ['fence'], insert: { before: '```\n', after: '\n```', block: true } },
  { id: 'mathblock', label: 'Math block', keywords: ['latex', 'equation'], insert: { before: '$$\n', after: '\n$$', block: true } },
  { id: 'table', label: 'Table', detail: '/table · /table4x2', keywords: ['grid'], insert: tableInsert(3, 3) },
  { id: 'bold', label: 'Bold', keywords: ['strong'], insert: { before: '**', after: '**' } },
  { id: 'highlight', label: 'Highlight', keywords: ['mark'], insert: { before: '==', after: '==' } },
  { id: 'inlinecode', label: 'Inline code', keywords: ['code', 'monospace'], insert: { before: '`', after: '`' } },
  { id: 'notelink', label: 'Note link', keywords: ['wikilink', 'link'], insert: { before: '[[', after: ']]' } },
  { id: 'weblink', label: 'Web link', keywords: ['url', 'href', 'link'], insert: { before: '[', after: '](https://)' } },
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
 * Commands matching what's typed after `/`: a word of the label, the id or a keyword must start
 * with the query. Direct matches come before keyword ones. `table4x2` yields a sized table instead.
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
  const ranked = SLASH_COMMANDS.map((command) => ({ command, rank: matchRank(command, q) })).filter(
    ({ rank }) => rank !== null,
  )
  // Array.prototype.sort is stable, so menu order holds within a rank.
  return ranked.sort((a, b) => a.rank! - b.rank!).map(({ command }) => command)
}

// 0: the id or the label with its spaces dropped ("heading2") starts with the query, 1: a later
// label word does, 2: only a keyword. Queries are one word: the menu closes on a space.
function matchRank(command: SlashCommand, q: string): number | null {
  const label = command.label.toLowerCase()
  if (command.id.startsWith(q) || label.replace(/\s+/g, '').startsWith(q)) return 0
  if (label.split(/\s+/).some((word) => word.startsWith(q))) return 1
  if (command.keywords?.some((word) => word.startsWith(q))) return 2
  return null
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
