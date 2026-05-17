import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SortSelector from './SortSelector'

describe('SortSelector', () => {
  it('shows the homepage page-jump select only when more than one page is available', () => {
    const { rerender } = render(
      <SortSelector
        sortBy="created_at"
        sortOrder="desc"
        onSortChange={vi.fn()}
        currentPage={1}
        totalPages={1}
        onPageChange={vi.fn()}
      />
    )

    expect(screen.queryByLabelText('跳转到结果页')).not.toBeInTheDocument()

    rerender(
      <SortSelector
        sortBy="created_at"
        sortOrder="desc"
        onSortChange={vi.fn()}
        currentPage={1}
        totalPages={3}
        onPageChange={vi.fn()}
      />
    )

    expect(screen.getByLabelText('跳转到结果页')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '第 1 页' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '第 3 页' })).toBeInTheDocument()
  })

  it('calls the homepage page setter when a new page is selected', () => {
    const onPageChange = vi.fn()

    render(
      <SortSelector
        sortBy="created_at"
        sortOrder="desc"
        onSortChange={vi.fn()}
        currentPage={2}
        totalPages={4}
        onPageChange={onPageChange}
      />
    )

    fireEvent.change(screen.getByLabelText('跳转到结果页'), {
      target: { value: '4' },
    })

    expect(onPageChange).toHaveBeenCalledWith(4)
  })
})
