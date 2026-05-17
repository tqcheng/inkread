import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import AdminBar from './AdminBar'

describe('AdminBar', () => {
  it('requires explicit confirmation before batch delete', async () => {
    const onBatchDelete = vi.fn().mockResolvedValue(undefined)

    render(
      <AdminBar
        selectedCount={3}
        onClearSelection={vi.fn()}
        onBatchDelete={onBatchDelete}
      />
    )

    expect(screen.queryByText('确认删除选中的书籍记录？')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '批量删除' }))

    expect(screen.getByText('确认删除选中的书籍记录？')).toBeInTheDocument()
    expect(
      screen.getByText('此操作只会删除数据库记录，不会删除原始源文件。')
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    expect(onBatchDelete).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(
        screen.queryByText('确认删除选中的书籍记录？')
      ).not.toBeInTheDocument()
    })
  })

  it('cancels the confirmation state without deleting', () => {
    const onBatchDelete = vi.fn()

    render(
      <AdminBar
        selectedCount={2}
        onClearSelection={vi.fn()}
        onBatchDelete={onBatchDelete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '批量删除' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(onBatchDelete).not.toHaveBeenCalled()
    expect(screen.queryByText('确认删除选中的书籍记录？')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '批量删除' })).toBeInTheDocument()
  })

  it('keeps the confirmation open when batch delete rejects', async () => {
    const onBatchDelete = vi.fn().mockRejectedValue(new Error('delete failed'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      render(
        <AdminBar
          selectedCount={2}
          onClearSelection={vi.fn()}
          onBatchDelete={onBatchDelete}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: '批量删除' }))
      fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

      await waitFor(() => {
        expect(onBatchDelete).toHaveBeenCalledTimes(1)
      })

      expect(screen.getByText('确认删除选中的书籍记录？')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('删除失败，请重试。')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Batch delete failed:',
        expect.any(Error)
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('keeps source-file deletion unchecked by default', () => {
    render(
      <AdminBar
        selectedCount={2}
        onClearSelection={vi.fn()}
        onBatchDelete={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '批量删除' }))

    const checkbox = screen.getByRole('checkbox', { name: '同时删除原始文件' })
    expect(checkbox).not.toBeChecked()
    expect(
      screen.getByText('此操作只会删除数据库记录，不会删除原始源文件。')
    ).toBeInTheDocument()
  })

  it('sends delete_source_files=true only after the checkbox is enabled', async () => {
    const onBatchDelete = vi.fn().mockResolvedValue(undefined)

    render(
      <AdminBar
        selectedCount={2}
        onClearSelection={vi.fn()}
        onBatchDelete={onBatchDelete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '批量删除' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '同时删除原始文件' }))

    expect(
      screen.getByText(
        '只有原始文件删除成功的书籍才会从数据库中移除。失败的书籍会保留。'
      )
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(onBatchDelete).toHaveBeenCalledWith({ deleteSourceFiles: true })
    })
  })

  it('resets confirmation state when selection count drops to zero', () => {
    const { rerender } = render(
      <AdminBar
        selectedCount={2}
        onClearSelection={vi.fn()}
        onBatchDelete={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '批量删除' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '同时删除原始文件' }))

    rerender(
      <AdminBar
        selectedCount={0}
        onClearSelection={vi.fn()}
        onBatchDelete={vi.fn()}
      />
    )

    expect(screen.queryByText('确认删除选中的书籍记录？')).not.toBeInTheDocument()

    rerender(
      <AdminBar
        selectedCount={2}
        onClearSelection={vi.fn()}
        onBatchDelete={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: '批量删除' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: '同时删除原始文件' })).not.toBeInTheDocument()
  })

  it('clears the delete error when the confirmation is reopened', async () => {
    const onBatchDelete = vi.fn().mockRejectedValue(new Error('delete failed'))

    render(
      <AdminBar
        selectedCount={2}
        onClearSelection={vi.fn()}
        onBatchDelete={onBatchDelete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '批量删除' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '同时删除原始文件' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('删除失败，请重试。')

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.click(screen.getByRole('button', { name: '批量删除' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('此操作只会删除数据库记录，不会删除原始源文件。')).toBeInTheDocument()
  })
})
