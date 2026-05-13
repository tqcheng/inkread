import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useReaderSettings } from '../../../hooks/useReaderSettings'
import { PAGE_STAGE_MAX_WIDTH } from './layout'
import { PageContent } from './PageContent'
import { PageReaderShell } from './PageReaderShell'

describe('PageReaderShell', () => {
  it('routes clicks by hot zone', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const onToggleToolbar = vi.fn()

    render(
      <PageReaderShell
        pageContent={<div>正文</div>}
        onPrev={onPrev}
        onNext={onNext}
        onToggleToolbar={onToggleToolbar}
      />
    )

    const stage = screen.getByTestId('page-reader-stage')
    const child = screen.getByText('正文')

    Object.defineProperty(stage, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 1000 }),
    })

    fireEvent.click(stage, { clientX: 100 })
    fireEvent.click(stage, { clientX: 300 })
    fireEvent.click(child, { clientX: 500 })
    fireEvent.click(stage, { clientX: 700 })
    fireEvent.click(stage, { clientX: 900 })

    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onToggleToolbar).toHaveBeenCalledTimes(3)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect((stage as HTMLDivElement).style.width).toBe('100%')
    expect((stage as HTMLDivElement).style.maxWidth).toBe(
      `${PAGE_STAGE_MAX_WIDTH}px`
    )
  })

  it('renders page content with reader typography settings', () => {
    const previousState = useReaderSettings.getState()

    try {
      useReaderSettings.setState({
        ...previousState,
        fontSize: 22,
        lineHeight: 1.8,
      })

      const { container } = render(
        <PageContent
          page={{
            chapterIndex: 0,
            pageInChapter: 0,
            startOffset: 0,
            endOffset: 2,
            anchorOffset: 0,
            blocks: [
              {
                key: 'p-1',
                kind: 'paragraph',
                text: '正文',
                startOffset: 0,
                endOffset: 2,
              },
            ],
          }}
        />
      )

      expect(container.firstChild).toHaveStyle({
        fontSize: '22px',
        lineHeight: '1.8',
      })
    } finally {
      useReaderSettings.setState(previousState)
    }
  })
})
