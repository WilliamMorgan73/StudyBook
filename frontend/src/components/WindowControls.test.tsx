// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PageHeader } from './PageHeader'
import { DesktopTitleBar, WindowControls } from './WindowControls'

describe('window controls in a browser', () => {
  afterEach(cleanup)

  it('render nothing outside the desktop shell', () => {
    const { container } = render(
      <>
        <WindowControls />
        <DesktopTitleBar />
      </>,
    )
    expect(container.innerHTML).toBe('')
  })

  it('leave a header without right-hand content unchanged', () => {
    const { container } = render(<PageHeader left={<span>Title</span>} />)
    expect(container.querySelectorAll('header > div')).toHaveLength(1)
    expect(container.querySelector('button')).toBeNull()
  })
})
