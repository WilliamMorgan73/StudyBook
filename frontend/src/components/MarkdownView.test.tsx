// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MarkdownView } from './MarkdownView'

function renderMarkdown(markdown: string) {
  return render(<MarkdownView>{markdown}</MarkdownView>).container
}

describe('MarkdownView callouts', () => {
  it('renders a typed blockquote as a titled callout with an icon', () => {
    const container = renderMarkdown('> [!tip] Revise early\n> Start a week out.')
    const aside = container.querySelector('aside.callout.callout-tip')!
    expect(aside).not.toBeNull()
    expect(container.querySelector('blockquote')).toBeNull()

    const title = aside.querySelector('.callout-title')!
    expect(title.textContent).toBe('Revise early')
    expect(title.querySelector('svg')).not.toBeNull()
    expect(aside.textContent).toContain('Start a week out.')
    expect(aside.textContent).not.toContain('[!tip]')
  })

  it("uses the type's label when there's no title", () => {
    const container = renderMarkdown('> [!definition]\n> Osmosis is water moving across a membrane.')
    expect(container.querySelector('.callout-title')!.textContent).toBe('Definition')
  })

  it('keeps inline formatting in the title', () => {
    const container = renderMarkdown('> [!note] The **key** idea\n> Body')
    const title = container.querySelector('.callout-title')!
    expect(title.querySelector('strong')?.textContent).toBe('key')
    expect(title.textContent).toBe('The key idea')
    expect(container.querySelector('aside')!.textContent).toContain('Body')
  })

  it('leaves a plain quote alone', () => {
    const container = renderMarkdown('> Just a quote')
    expect(container.querySelector('blockquote')!.textContent).toContain('Just a quote')
    expect(container.querySelector('aside')).toBeNull()
  })
})

describe('MarkdownView GFM', () => {
  it('renders checklists', () => {
    const container = renderMarkdown('- [x] done\n- [ ] todo')
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect([...boxes].map((box) => box.checked)).toEqual([true, false])
  })
})
