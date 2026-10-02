import { describe, expect, it } from 'vitest'

import {
  buildTableMarkdown,
  EMPTY_CELL,
  filterSlashCommands,
  findHighlights,
  parseTableShorthand,
  planSlashInsert,
  SLASH_COMMANDS,
} from '@/lib/markdownBlocks'

describe('findHighlights', () => {
  it('finds ==text== spans with their inner range', () => {
    expect(findHighlights('a ==key idea== b')).toEqual([{ from: 2, to: 14, inner: { from: 4, to: 12 } }])
  })

  it('ignores comparisons and spans with space just inside', () => {
    expect(findHighlights('if a == b and c == d')).toEqual([])
    expect(findHighlights('== spaced ==')).toEqual([])
  })

  it('does not cross lines', () => {
    expect(findHighlights('==one\ntwo==')).toEqual([])
  })
})

describe('filterSlashCommands', () => {
  it('returns every command for an empty query', () => {
    expect(filterSlashCommands('')).toBe(SLASH_COMMANDS)
  })

  it('matches the start of label words, ids and keywords', () => {
    const ids = (q: string) => filterSlashCommands(q).map((c) => c.id)
    expect(ids('check')).toEqual(['checklist'])
    expect(ids('todo')).toEqual(['checklist'])
    expect(ids('list')).toEqual(['list', 'numbered', 'checklist'])
    expect(ids('HEAD')).toEqual(['h1', 'h2', 'h3'])
    expect(ids('zzz')).toEqual([])
  })

  it('turns a sized table shorthand into a single sized option', () => {
    const [option] = filterSlashCommands('table4x2')
    expect(option.label).toBe('Table 4 × 2')
    expect(option.insert.before).toBe(buildTableMarkdown(4, 2).text)
  })

  it('ignores out-of-range tables', () => {
    expect(parseTableShorthand('table13x1')).toBeNull()
    expect(parseTableShorthand('table0x3')).toBeNull()
    expect(parseTableShorthand('table3x12')).toEqual({ cols: 3, rows: 12 })
  })
})

describe('planSlashInsert', () => {
  const checklist = { before: '- [ ] ', after: '', block: true }

  it('puts the cursor between before and after', () => {
    expect(planSlashInsert({ before: '**', after: '**' }, 'some text ')).toEqual({
      replaceBack: 0,
      text: '****',
      selection: { from: 2, to: 2 },
    })
  })

  it('inserts a block in place on a blank or indented line', () => {
    expect(planSlashInsert(checklist, '')).toEqual({ replaceBack: 0, text: '- [ ] ', selection: { from: 6, to: 6 } })
    expect(planSlashInsert(checklist, '  ').replaceBack).toBe(0)
  })

  it('moves a block typed after text onto its own line, dropping the trailing space', () => {
    expect(planSlashInsert(checklist, 'notes  ')).toEqual({
      replaceBack: 2,
      text: '\n- [ ] ',
      selection: { from: 7, to: 7 },
    })
  })

  it('replaces a bare list, checklist or quote marker, keeping indentation', () => {
    const numbered = { before: '1. ', after: '', block: true }
    expect(planSlashInsert(numbered, '- [ ] ')).toMatchObject({ replaceBack: 6, text: '1. ' })
    expect(planSlashInsert(numbered, '  - ')).toMatchObject({ replaceBack: 2, text: '1. ' })
    expect(planSlashInsert(numbered, '3. ')).toMatchObject({ replaceBack: 3, text: '1. ' })
    expect(planSlashInsert(numbered, '> ')).toMatchObject({ replaceBack: 2, text: '1. ' })
  })

  it('keeps a list item that already has text', () => {
    expect(planSlashInsert({ before: '1. ', after: '', block: true }, '- item ')).toMatchObject({
      replaceBack: 1,
      text: '\n1. ',
    })
  })

  it('offsets an explicit selection by the newline prefix', () => {
    const table = filterSlashCommands('table')[0].insert
    expect(planSlashInsert(table, 'text ').selection).toEqual({ from: 3, to: 11 })
  })
})

describe('buildTableMarkdown', () => {
  it('builds header, divider and empty data rows', () => {
    const { text } = buildTableMarkdown(2, 1)
    expect(text).toBe(`| Header 1 | Header 2 |\n| --- | --- |\n| ${EMPTY_CELL} | ${EMPTY_CELL} |`)
  })
})
