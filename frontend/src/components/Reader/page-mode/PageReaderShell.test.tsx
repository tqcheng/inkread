import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
    Object.defineProperty(stage, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 1000 }),
    })

    fireEvent.click(stage, { clientX: 100 })
    fireEvent.click(stage, { clientX: 500 })
    fireEvent.click(stage, { clientX: 900 })

    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onToggleToolbar).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})
