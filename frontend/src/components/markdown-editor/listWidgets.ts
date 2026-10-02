import { WidgetType, type EditorView } from '@codemirror/view'

export class BulletWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-list-bullet'
    span.textContent = '•'
    return span
  }
  eq() {
    return true
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Stands in for a GFM `[ ]`/`[x]` TaskMarker. Styled after `components/ui/checkbox.tsx`, which
 * can't be used directly since widgets are plain DOM.
 */
export class CheckboxWidget extends WidgetType {
  checked: boolean
  constructor(checked: boolean) {
    super()
    this.checked = checked
  }

  toDOM(view: EditorView) {
    const box = document.createElement('span')
    box.className = 'cm-task-checkbox'
    box.setAttribute('role', 'checkbox')
    box.setAttribute('aria-checked', String(this.checked))
    if (this.checked) {
      const svg = document.createElementNS(SVG_NS, 'svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', 'M20 6 9 17l-5-5') // lucide's Check, same as ui/checkbox.tsx
      svg.appendChild(path)
      box.appendChild(svg)
    }
    // mousedown, not click: preventDefault stops CodeMirror moving the cursor onto this line,
    // which would swap the checkbox back to raw `[ ]` mid-click.
    box.addEventListener('mousedown', (event) => {
      event.preventDefault()
      toggleTaskMarker(view, view.posAtDOM(box))
    })
    return box
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }

  ignoreEvent() {
    return true
  }
}

function toggleTaskMarker(view: EditorView, pos: number) {
  const marker = view.state.sliceDoc(pos, pos + 3)
  if (!/^\[[ xX]\]$/.test(marker)) return
  view.dispatch({
    changes: { from: pos + 1, to: pos + 2, insert: marker[1] === ' ' ? 'x' : ' ' },
    userEvent: 'input.toggle-task',
  })
  // Notes save on blur, so an edit made while unfocused would never be saved. Focusing here
  // makes the next blur save it (view.hasFocus is unreliable here, so always focus). The
  // selection is untouched, so the toggled line stays rendered.
  view.focus()
}
