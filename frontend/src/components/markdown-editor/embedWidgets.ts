import { Facet } from '@codemirror/state'
import { type EditorView, WidgetType } from '@codemirror/view'

import type { Attachment } from '@/lib/api'

import { toggleEmbedEffect } from './folding'

/** The note's Attachments, which `![[name]]` embeds resolve against. */
export const attachmentsFacet = Facet.define<readonly Attachment[], readonly Attachment[]>({
  combine: (values) => values[0] ?? [],
})

export class ImageWidget extends WidgetType {
  src: string
  constructor(src: string) {
    super()
    this.src = src
  }
  toDOM() {
    // Spaced by the wrapper's padding, never a margin (see theme.ts).
    const wrap = document.createElement('span')
    wrap.className = 'cm-image-wrap'
    const img = document.createElement('img')
    img.className = 'cm-image'
    img.src = this.src
    wrap.appendChild(img)
    return wrap
  }
  eq(other: ImageWidget) {
    return other.src === this.src
  }
}

function embedHeader(view: EditorView, filename: string, url: string, collapsed: boolean): HTMLElement {
  const header = document.createElement('div')
  header.className = 'cm-embed-header'
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'cm-embed-toggle'
  toggle.setAttribute('aria-label', collapsed ? `Expand ${filename}` : `Collapse ${filename}`)
  toggle.setAttribute('aria-expanded', String(!collapsed))
  toggle.textContent = '›'
  // On mousedown with preventDefault, like the checklist checkbox: the cursor stays put, so the
  // click doesn't also reveal the embed's source line.
  toggle.addEventListener('mousedown', (event) => {
    event.preventDefault()
    view.dispatch({ effects: toggleEmbedEffect.of(url) })
  })
  const name = document.createElement('span')
  name.className = 'cm-embed-name'
  name.textContent = filename
  const open = document.createElement('a')
  open.href = url
  open.target = '_blank'
  open.rel = 'noreferrer'
  open.textContent = 'Open'
  header.append(toggle, name, open)
  return header
}

/**
 * A PDF, video or audio Attachment embedded on its own line. Rebuilt only when `eq` fails, so a
 * PDF isn't reloaded while typing elsewhere (moving the cursor onto its line does unmount it).
 * Collapsed, it's just the header.
 */
export class MediaEmbedWidget extends WidgetType {
  kind: 'pdf' | 'video' | 'audio'
  url: string
  filename: string
  collapsed: boolean
  constructor(kind: 'pdf' | 'video' | 'audio', url: string, filename: string, collapsed: boolean) {
    super()
    this.kind = kind
    this.url = url
    this.filename = filename
    this.collapsed = collapsed
  }
  toDOM(view: EditorView) {
    const outer = document.createElement('div')
    outer.className = 'cm-embed-wrap' // spacing as padding, never a margin (see theme.ts)
    const wrapper = document.createElement('div')
    wrapper.className = `cm-embed cm-embed-${this.kind}${this.collapsed ? ' cm-embed-collapsed' : ''}`
    outer.appendChild(wrapper)
    wrapper.appendChild(embedHeader(view, this.filename, this.url, this.collapsed))
    if (this.collapsed) return outer
    if (this.kind === 'pdf') {
      const frame = document.createElement('iframe')
      // navpanes=0 hides the thumbnail sidebar Chrome otherwise opens in a narrow frame.
      frame.src = `${this.url}#view=FitH&navpanes=0`
      frame.title = this.filename
      wrapper.appendChild(frame)
    } else {
      const media = document.createElement(this.kind)
      media.controls = true
      media.preload = 'metadata'
      media.src = this.url
      wrapper.appendChild(media)
    }
    return outer
  }
  eq(other: MediaEmbedWidget) {
    return (
      other.kind === this.kind &&
      other.url === this.url &&
      other.filename === this.filename &&
      other.collapsed === this.collapsed
    )
  }
}

/** An inline embed: a link chip for a resolvable file, or a muted note for a missing one. */
export class FileChipWidget extends WidgetType {
  filename: string
  url: string | null
  constructor(filename: string, url: string | null) {
    super()
    this.filename = filename
    this.url = url
  }
  toDOM() {
    if (!this.url) {
      const missing = document.createElement('span')
      missing.className = 'cm-embed-chip cm-embed-missing'
      missing.textContent = `Missing attachment: ${this.filename}`
      return missing
    }
    const link = document.createElement('a')
    link.className = 'cm-embed-chip'
    link.href = this.url
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.textContent = this.filename
    return link
  }
  eq(other: FileChipWidget) {
    return other.filename === this.filename && other.url === this.url
  }
}
