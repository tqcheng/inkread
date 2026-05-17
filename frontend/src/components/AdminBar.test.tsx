import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import AdminBar from './AdminBar'

describe('AdminBar', () => {
  it('requires explicit confirmation before batch delete and explains source files are preserved', async () => {
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
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Batch delete failed:',
      expect.any(Error)
    )

    consoleErrorSpy.mockRestore()
  })
})
