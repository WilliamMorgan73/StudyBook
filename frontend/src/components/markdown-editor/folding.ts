import {
  codeFolding,
  ensureSyntaxTree,
  foldable,
  foldedRanges,
  foldEffect,
  syntaxTree,
  unfoldEffect,
} from '@codemirror/language'
import { StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'

// Heading folds (#37) use lang-markdown's own fold service, which folds a heading's section up to
// the next heading of the same or higher level; this adds the chevron and per-note persistence.
// Collapsed embeds (#38) are a separate set of Attachment URLs, read by MediaEmbedWidget.

const HEADING_NODE = /^(?:ATX|Setext)Heading\d$/

/** Flips one embed (by Attachment URL) between collapsed and expanded. */
export const toggleEmbedEffect = StateEffect.define<string>()
const setCollapsedEmbedsEffect = StateEffect.define<readonly string[]>()

export const collapsedEmbeds = StateField.define<ReadonlySet<string>>({
  create: () => new Set(),
  update(value, tr) {
    let next = value
    for (const effect of tr.effects) {
      if (effect.is(setCollapsedEmbedsEffect)) next = new Set(effect.value)
      if (effect.is(toggleEmbedEffect)) {
        const copy = new Set(next)
        if (!copy.delete(effect.value)) copy.add(effect.value)
        next = copy
      }
    }
    return next
  },
})

/** The heading line's section fold, if it's folded. */
function foldAt(state: EditorState, lineTo: number): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null
  foldedRanges(state).between(lineTo, lineTo, (from, to) => {
    if (from === lineTo) found = { from, to }
  })
  return found
}

class FoldChevronWidget extends WidgetType {
  folded: boolean
  constructor(folded: boolean) {
    super()
    this.folded = folded
  }
  toDOM() {
    const chevron = document.createElement('span')
    chevron.className = `cm-fold-chevron${this.folded ? ' cm-fold-chevron-folded' : ''}`
    chevron.setAttribute('aria-label', this.folded ? 'Expand section' : 'Collapse section')
    chevron.setAttribute('role', 'button')
    chevron.textContent = '›'
    return chevron
  }
  eq(other: FoldChevronWidget) {
    return other.folded === this.folded
  }
  ignoreEvent() {
    return false
  }
}

function buildChevrons(view: EditorView): DecorationSet {
  const { state } = view
  const ranges: Range<Decoration>[] = []
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (!HEADING_NODE.test(node.type.name)) return
        const line = state.doc.lineAt(node.from)
        const folded = foldAt(state, line.to) !== null
        if (!folded && !foldable(state, line.from, line.to)) return false
        ranges.push(Decoration.widget({ widget: new FoldChevronWidget(folded), side: -1 }).range(line.from))
        return false
      },
    })
  }
  return Decoration.set(ranges, true)
}

const chevrons = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildChevrons(view)
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState) ||
        foldedRanges(update.state) !== foldedRanges(update.startState)
      ) {
        this.decorations = buildChevrons(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

/** Folds or unfolds the section under the heading on `pos`'s line. */
function toggleHeadingFold(view: EditorView, pos: number): boolean {
  const { state } = view
  const line = state.doc.lineAt(pos)
  const folded = foldAt(state, line.to)
  if (folded) {
    view.dispatch({ effects: unfoldEffect.of(folded) })
    return true
  }
  const range = foldable(state, line.from, line.to)
  if (!range) return false
  view.dispatch({ effects: foldEffect.of(range) })
  return true
}

// mousedown with preventDefault, like the checklist checkbox: the cursor stays where it was, so
// clicking a chevron doesn't also reveal the heading's `#` source.
const chevronClicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return false
    if (target.closest('.cm-fold-chevron')) {
      event.preventDefault()
      return toggleHeadingFold(view, view.posAtDOM(target))
    }
    return false
  },
})

/** What's collapsed in one note: heading lines (their text) and embeds (Attachment URLs). */
export interface FoldSnapshot {
  headings: string[]
  embeds: string[]
}

export function snapshotFolds(state: EditorState): FoldSnapshot {
  const headings: string[] = []
  foldedRanges(state).between(0, state.doc.length, (from) => {
    const text = state.doc.lineAt(from).text
    if (/^#{1,6}\s/.test(text)) headings.push(text)
  })
  return { headings, embeds: [...state.field(collapsedEmbeds, false) ?? []] }
}

/** Re-applies a snapshot: every heading line whose text matches, and the collapsed embeds. */
export function restoreFolds(view: EditorView, snapshot: FoldSnapshot) {
  const { state } = view
  // Folding needs the whole tree; a long note may still be parsing when the editor mounts.
  ensureSyntaxTree(state, state.doc.length, 200)
  const wanted = new Set(snapshot.headings)
  const effects: StateEffect<unknown>[] = [setCollapsedEmbedsEffect.of(snapshot.embeds)]
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    if (!wanted.has(line.text)) continue
    const range = foldable(state, line.from, line.to)
    if (range) effects.push(foldEffect.of(range))
  }
  view.dispatch({ effects })
}

const STORAGE_PREFIX = 'studybook:folds:'

export function loadFoldSnapshot(key: string): FoldSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<FoldSnapshot>
    return {
      headings: Array.isArray(parsed.headings) ? parsed.headings.filter((h) => typeof h === 'string') : [],
      embeds: Array.isArray(parsed.embeds) ? parsed.embeds.filter((e) => typeof e === 'string') : [],
    }
  } catch {
    return null
  }
}

function saveFoldSnapshot(key: string, snapshot: FoldSnapshot) {
  try {
    if (snapshot.headings.length === 0 && snapshot.embeds.length === 0) {
      localStorage.removeItem(STORAGE_PREFIX + key)
    } else {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(snapshot))
    }
  } catch {
    // Storage blocked or full: folds just won't survive a reload.
  }
}

/** Saves the note's folds whenever a heading or embed is collapsed or expanded. */
function persistFolds(key: string) {
  return EditorView.updateListener.of((update) => {
    const changed =
      foldedRanges(update.state) !== foldedRanges(update.startState) ||
      update.state.field(collapsedEmbeds, false) !== update.startState.field(collapsedEmbeds, false)
    // Typing maps fold positions (a new RangeSet) without folding anything, so compare contents.
    if (!changed) return
    const before = snapshotFolds(update.startState)
    const after = snapshotFolds(update.state)
    if (JSON.stringify(before) !== JSON.stringify(after)) saveFoldSnapshot(key, after)
  })
}

/**
 * Heading folding with a hover chevron (folded ones always show), collapsible embeds, and, given a
 * `storageKey`, folds remembered per note in this browser.
 */
export function folding(storageKey?: string): Extension {
  return [
    codeFolding({ placeholderText: '…' }),
    collapsedEmbeds,
    chevrons,
    chevronClicks,
    storageKey ? persistFolds(storageKey) : [],
  ]
}
