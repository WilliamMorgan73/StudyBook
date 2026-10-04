// @vitest-environment jsdom
import { markdown } from '@codemirror/lang-markdown'
import { foldedRanges } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'

import {
  collapsedEmbeds,
  folding,
  loadFoldSnapshot,
  restoreFolds,
  snapshotFolds,
  toggleEmbedEffect,
} from './folding'

const NOTE = ['# Intro', 'text', '## Proofs', 'proof one', '## Examples', 'example', '# Next', 'more'].join('\n')

function makeView(doc = NOTE, key?: string) {
  return new EditorView({
    state: EditorState.create({ doc, extensions: [markdown(), folding(key)] }),
    parent: document.body,
  })
}

function folded(view: EditorView): string[] {
  const out: string[] = []
  foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
    out.push(view.state.doc.sliceString(from, to))
  })
  return out
}

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('heading folds', () => {
  it('folds a heading up to the next heading of the same or higher level', () => {
    const view = makeView()
    restoreFolds(view, { headings: ['## Proofs', '# Intro'], embeds: [] })
    expect(folded(view)).toEqual(['\ntext\n## Proofs\nproof one\n## Examples\nexample', '\nproof one'])
  })

  it('snapshots folded headings by their line text', () => {
    const view = makeView()
    restoreFolds(view, { headings: ['## Examples'], embeds: [] })
    expect(snapshotFolds(view.state)).toEqual({ headings: ['## Examples'], embeds: [] })
  })

  it('ignores headings that no longer exist', () => {
    const view = makeView()
    restoreFolds(view, { headings: ['## Renamed'], embeds: [] })
    expect(folded(view)).toEqual([])
  })
})

describe('collapsed embeds', () => {
  it('toggles an embed by Attachment URL', () => {
    const view = makeView()
    view.dispatch({ effects: toggleEmbedEffect.of('/uploads/a.pdf') })
    expect([...view.state.field(collapsedEmbeds)]).toEqual(['/uploads/a.pdf'])
    view.dispatch({ effects: toggleEmbedEffect.of('/uploads/a.pdf') })
    expect([...view.state.field(collapsedEmbeds)]).toEqual([])
  })
})

describe('persistence', () => {
  it('saves folds under the note key and loads them back', () => {
    const view = makeView(NOTE, 'submodule:1')
    restoreFolds(view, { headings: ['## Proofs'], embeds: [] })
    view.dispatch({ effects: toggleEmbedEffect.of('/uploads/a.pdf') })
    expect(loadFoldSnapshot('submodule:1')).toEqual({ headings: ['## Proofs'], embeds: ['/uploads/a.pdf'] })
  })

  it('forgets a note once nothing is folded', () => {
    const view = makeView(NOTE, 'submodule:1')
    view.dispatch({ effects: toggleEmbedEffect.of('/uploads/a.pdf') })
    view.dispatch({ effects: toggleEmbedEffect.of('/uploads/a.pdf') })
    expect(localStorage.getItem('studybook:folds:submodule:1')).toBeNull()
  })

  it('treats malformed storage as nothing saved', () => {
    localStorage.setItem('studybook:folds:x', '{not json')
    expect(loadFoldSnapshot('x')).toBeNull()
    localStorage.setItem('studybook:folds:y', JSON.stringify({ headings: [1, '# A'], embeds: 'nope' }))
    expect(loadFoldSnapshot('y')).toEqual({ headings: ['# A'], embeds: [] })
  })
})
