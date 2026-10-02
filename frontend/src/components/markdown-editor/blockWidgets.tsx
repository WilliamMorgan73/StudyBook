import { WidgetType, type EditorView } from '@codemirror/view'
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { CalloutIcon } from '@/components/CalloutIcon'
import { ColumnsBlockView } from '@/components/ColumnsBlockView'
import { CALLOUT_LABELS, type CalloutType, type ColumnsBlock } from '@/lib/markdownBlocks'

interface Mounted {
  root: Root
  observer?: ResizeObserver
}

const mounted = new WeakMap<HTMLElement, Mounted>()

// React content inside a widget renders after toDOM returns, and can resize later (images,
// KaTeX), so a block widget re-measures on resize or CodeMirror's height map drifts and clicks
// land on the wrong line.
function mountReact(dom: HTMLElement, element: ReactNode, view?: EditorView) {
  const root = createRoot(dom)
  root.render(element)
  const observer = view ? new ResizeObserver(() => view.requestMeasure()) : undefined
  observer?.observe(dom)
  mounted.set(dom, { root, observer })
}

function unmountReact(dom: HTMLElement) {
  const entry = mounted.get(dom)
  if (!entry) return
  mounted.delete(dom)
  entry.observer?.disconnect()
  // CodeMirror can destroy widgets while React is mid-render (react-codemirror dispatches from
  // effects), and a synchronous unmount there throws a warning; defer it.
  queueMicrotask(() => entry.root.unmount())
}

/** Stands in for a callout's `[!type] ` marker: the icon, plus the type's label if untitled. */
export class CalloutMarkerWidget extends WidgetType {
  type: CalloutType
  untitled: boolean
  constructor(type: CalloutType, untitled: boolean) {
    super()
    this.type = type
    this.untitled = untitled
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-callout-marker'
    mountReact(
      span,
      <>
        <CalloutIcon type={this.type} />
        {this.untitled && CALLOUT_LABELS[this.type]}
      </>,
    )
    return span
  }
  destroy(dom: HTMLElement) {
    unmountReact(dom)
  }
  eq(other: CalloutMarkerWidget) {
    return other.type === this.type && other.untitled === this.untitled
  }
}

/** A complete `:::columns` block, rendered as main text beside a side box. */
export class ColumnsWidget extends WidgetType {
  block: ColumnsBlock
  constructor(block: ColumnsBlock) {
    super()
    this.block = block
  }
  toDOM(view: EditorView) {
    const div = document.createElement('div')
    div.className = 'cm-columns'
    mountReact(
      div,
      <ColumnsBlockView main={this.block.main} sideTitle={this.block.sideTitle} side={this.block.side} />,
      view,
    )
    return div
  }
  destroy(dom: HTMLElement) {
    unmountReact(dom)
  }
  eq(other: ColumnsWidget) {
    return (
      other.block.main === this.block.main &&
      other.block.sideTitle === this.block.sideTitle &&
      other.block.side === this.block.side
    )
  }
  // Let CodeMirror handle clicks, so clicking the block puts the cursor in it and shows the source.
  ignoreEvent() {
    return false
  }
}
