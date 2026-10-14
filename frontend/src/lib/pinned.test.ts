import { describe, expect, it } from 'vitest'

import { addTile, isMissing, MAX_TILES, moveTile, normalizeUrl, PINNED_CONFIG, removeTile, tileGrid, tileHref, type PinnedTile } from '@/lib/pinned'

const moduleTile: PinnedTile = { kind: 'module', moduleId: 3, title: 'Networks' }
const topicTile: PinnedTile = { kind: 'topic', moduleId: 3, submoduleId: 12, title: 'Routing' }
const linkTile: PinnedTile = { kind: 'link', url: 'https://moodle.example.ac.uk/', title: 'Moodle', icon: 'book' }

describe('PINNED_CONFIG.normalize', () => {
  it('starts empty and drops tiles it cannot use', () => {
    expect(PINNED_CONFIG.normalize(undefined)).toEqual({ tiles: [] })
    const { tiles } = PINNED_CONFIG.normalize({
      tiles: [
        moduleTile,
        { kind: 'module', moduleId: 'x' },
        { kind: 'link', url: 'javascript:alert(1)', title: 'Bad' },
        { kind: 'link', url: 'timetable.example.com', title: '', icon: 'rocket' },
        { kind: 'weather' },
        null,
      ],
    })
    expect(tiles).toEqual([moduleTile, { kind: 'link', url: 'https://timetable.example.com/', title: 'timetable.example.com', icon: 'link' }])
  })

  it('caps the number of tiles', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ kind: 'module', moduleId: i + 1, title: `M${i}` }))
    expect(PINNED_CONFIG.normalize({ tiles: many }).tiles).toHaveLength(MAX_TILES)
  })

  it('is stable', () => {
    const once = PINNED_CONFIG.normalize({ tiles: [moduleTile, topicTile, linkTile] })
    expect(PINNED_CONFIG.normalize(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })
})

describe('normalizeUrl', () => {
  it('accepts http(s) and bare domains only', () => {
    expect(normalizeUrl('https://a.example/x')).toBe('https://a.example/x')
    expect(normalizeUrl('a.example')).toBe('https://a.example/')
    expect(normalizeUrl('ftp://a.example')).toBeNull()
    expect(normalizeUrl('   ')).toBeNull()
  })
})

describe('tile editing', () => {
  it('links each kind to its page', () => {
    expect(tileHref(moduleTile)).toBe('/modules/3')
    expect(tileHref(topicTile)).toBe('/modules/3/submodules/12')
    expect(tileHref({ kind: 'assignment', moduleId: 3, assignmentId: 7, title: '' })).toBe('/modules/3/assignments/7')
    expect(tileHref(linkTile)).toBe('https://moodle.example.ac.uk/')
  })

  it("adds, doesn't pin the same thing twice, reorders and removes", () => {
    const tiles = addTile(addTile([moduleTile], topicTile), { ...moduleTile, title: 'Renamed' })
    expect(tiles).toEqual([moduleTile, topicTile])
    expect(moveTile(tiles, 1, -1)).toEqual([topicTile, moduleTile])
    expect(moveTile(tiles, 1, 1)).toEqual(tiles)
    expect(removeTile(tiles, 0)).toEqual([topicTile])
  })

  it('flags app items that are gone, once it knows', () => {
    expect(isMissing(topicTile, {})).toBe(false)
    expect(isMissing(topicTile, { topics: new Set([1]) })).toBe(true)
    expect(isMissing(moduleTile, { modules: new Set([3]) })).toBe(false)
    expect(isMissing(linkTile, { modules: new Set() })).toBe(false)
  })
})

describe('tileGrid', () => {
  it('lets one tile fill the widget', () => {
    expect(tileGrid(1, 400, 200)).toEqual({ cols: 1, rows: 1, fill: true })
  })

  it('splits the space as tiles are added, side by side when wide and stacked when tall', () => {
    expect(tileGrid(2, 800, 150)).toEqual({ cols: 2, rows: 1, fill: true })
    expect(tileGrid(2, 300, 400)).toEqual({ cols: 1, rows: 2, fill: true })
    expect(tileGrid(4, 600, 300)).toMatchObject({ cols: 2, rows: 2, fill: true })
  })

  it('scrolls at the minimum size when the tiles no longer fit', () => {
    expect(tileGrid(12, 300, 120)).toEqual({ cols: 2, rows: 6, fill: false })
  })
})
