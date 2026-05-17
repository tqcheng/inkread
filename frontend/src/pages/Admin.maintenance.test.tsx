import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Admin from './Admin'
import { adminApi } from '../api/admin'
import type { DedupGroup } from '../api/types'

let queryClient: QueryClient

vi.mock('../api/admin', () => ({
  adminApi: {
    getOrphanedBooksCount: vi.fn(),
    getDedupSummary: vi.fn(),
    getDedupGroups: vi.fn(),
    resolveDedupGroup: vi.fn(),
    cleanupOrphanedBooks: vi.fn(),
    resetDatabase: vi.fn(),
    updateSecuritySettings: vi.fn(),
  },
}))

vi.mock('../hooks/useScan', () => ({
  useScanSummary: () => ({
    data: { completed: 0, running: 0, failed: 0 },
    refetch: vi.fn(),
  }),
  useScanStatus: () => ({
    data: null,
    isLoading: false,
  }),
  useTriggerScanMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}))

vi.mock('../components/SecuritySettingsSection', () => ({
  default: () => <div>SecuritySettingsSection</div>,
}))

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

function makeDedupGroup(): DedupGroup {
  return {
    content_md5: 'deadbeefcafebabe',
    count: 2,
    recommended_keep_book_id: 101,
    items: [
      {
        id: 101,
        title: 'Kept Book',
        filename: 'kept.txt',
        file_path: '/books/kept.txt',
        file_size: 1024,
        file_mtime: '2026-01-01T00:00:00Z',
        is_favorite: false,
        last_read_position: 10,
        chapter_count: 12,
      },
      {
        id: 102,
        title: 'Duplicate Book',
        filename: 'duplicate.txt',
        file_path: '/books/duplicate.txt',
        file_size: 2048,
        file_mtime: '2026-01-02T00:00:00Z',
        is_favorite: false,
        last_read_position: 0,
        chapter_count: 12,
      },
    ],
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('Admin database maintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getOrphanedBooksCount).mockResolvedValue({ orphaned_books: 0 })
    vi.mocked(adminApi.getDedupSummary).mockResolvedValue({
      duplicate_groups: 0,
      duplicate_books: 0,
      ignored_groups: 0,
    })
    vi.mocked(adminApi.getDedupGroups).mockResolvedValue({ items: [] })
    vi.mocked(adminApi.resetDatabase).mockResolvedValue({
      success: true,
      message: '数据库已重置',
    })
  })

  it('loads maintenance tools without requiring an admin key', async () => {
    render(<Admin />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(adminApi.getOrphanedBooksCount).toHaveBeenCalledTimes(1)
      expect(adminApi.getDedupSummary).toHaveBeenCalledTimes(1)
      expect(adminApi.getDedupGroups).toHaveBeenCalledTimes(1)
    })

    expect(screen.queryByText('管理员密钥')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('输入管理员密钥')).not.toBeInTheDocument()
    expect(screen.getByText('SecuritySettingsSection')).toBeInTheDocument()
  })

  it('closes the reset confirmation dialog after a successful reset', async () => {
    render(<Admin />, { wrapper: createWrapper() })

    fireEvent.click(await screen.findByRole('button', { name: '重置数据库' }))

    expect(screen.getByRole('heading', { name: '确认重置数据库？' })).toBeInTheDocument()
    expect(
      screen.getByText('此操作只会删除数据库记录和设置，不会删除原始源文件。')
    ).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('输入管理员密钥')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '确认重置' }))

    await waitFor(() => {
      expect(adminApi.resetDatabase).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: '确认重置数据库？' })
      ).not.toBeInTheDocument()
    })
    expect(screen.queryByPlaceholderText('输入管理员密钥')).not.toBeInTheDocument()
  })

  it('keeps API error handling in the reset confirmation dialog', async () => {
    vi.mocked(adminApi.resetDatabase).mockRejectedValue(new Error('后端失败'))

    render(<Admin />, { wrapper: createWrapper() })

    fireEvent.click(await screen.findByRole('button', { name: '重置数据库' }))
    fireEvent.click(screen.getByRole('button', { name: '确认重置' }))

    expect(await screen.findByText('后端失败')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '确认重置数据库？' })).toBeInTheDocument()
  })

  it('clears stale maintenance state immediately after a successful reset', async () => {
    vi.mocked(adminApi.getOrphanedBooksCount).mockResolvedValue({ orphaned_books: 3 })
    vi.mocked(adminApi.getDedupSummary).mockResolvedValue({
      duplicate_groups: 1,
      duplicate_books: 2,
      ignored_groups: 0,
    })
    vi.mocked(adminApi.getDedupGroups).mockResolvedValue({ items: [makeDedupGroup()] })
    vi.mocked(adminApi.cleanupOrphanedBooks).mockResolvedValue({ deleted: 3 })
    vi.mocked(adminApi.resolveDedupGroup).mockResolvedValue({
      content_md5: 'deadbeefcafebabe',
      keep_book_id: 101,
      deleted_book_ids: [102],
      mode: 'hard_delete',
      delete_source_files: true,
      file_results: [
        {
          book_id: 102,
          file_path: '/books/duplicate.txt',
          deleted: false,
          reason: 'permission denied',
        },
      ],
    })

    render(<Admin />, { wrapper: createWrapper() })

    expect(await screen.findByText('检测到 3 本书籍文件已不存在')).toBeInTheDocument()
    expect(screen.getByText('重复组 1，重复书籍 2，已忽略 0')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '清理数据库' }))
    expect(await screen.findByText('已删除 3 本孤立书籍')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '展开重复组' }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '硬删除其余' }))

    expect(
      await screen.findByText('部分原始文件未删除（1 个），可能会在后续扫描中重新出现。')
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重置数据库' }))
    fireEvent.click(screen.getByRole('button', { name: '确认重置' }))

    await waitFor(() => {
      expect(adminApi.resetDatabase).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: '确认重置数据库？' })).not.toBeInTheDocument()
    })

    expect(screen.getByText('检测到 0 本书籍文件已不存在')).toBeInTheDocument()
    expect(screen.getByText('重复组 0，重复书籍 0，已忽略 0')).toBeInTheDocument()
    expect(screen.getByText('暂无重复书籍')).toBeInTheDocument()
    expect(screen.queryByText('已删除 3 本孤立书籍')).not.toBeInTheDocument()
    expect(
      screen.queryByText('部分原始文件未删除（1 个），可能会在后续扫描中重新出现。')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Duplicate Book')).not.toBeInTheDocument()
  })

  it('ignores stale maintenance responses that resolve after a successful reset', async () => {
    const orphanedRequest = deferred<{ orphaned_books: number }>()
    const dedupSummaryRequest = deferred<{
      duplicate_groups: number
      duplicate_books: number
      ignored_groups: number
    }>()
    const dedupGroupsRequest = deferred<{ items: DedupGroup[] }>()

    vi.mocked(adminApi.getOrphanedBooksCount).mockReturnValue(orphanedRequest.promise)
    vi.mocked(adminApi.getDedupSummary).mockReturnValue(dedupSummaryRequest.promise)
    vi.mocked(adminApi.getDedupGroups).mockReturnValue(dedupGroupsRequest.promise)

    render(<Admin />, { wrapper: createWrapper() })

    expect(await screen.findByText('重复书籍加载中...')).toBeInTheDocument()
    expect(screen.getByText('检测中...')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重置数据库' }))
    fireEvent.click(screen.getByRole('button', { name: '确认重置' }))

    await waitFor(() => {
      expect(adminApi.resetDatabase).toHaveBeenCalledTimes(1)
    })

    orphanedRequest.resolve({ orphaned_books: 7 })
    dedupSummaryRequest.resolve({
      duplicate_groups: 4,
      duplicate_books: 9,
      ignored_groups: 1,
    })
    dedupGroupsRequest.resolve({ items: [makeDedupGroup()] })

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: '确认重置数据库？' })
      ).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText('检测到 0 本书籍文件已不存在')).toBeInTheDocument()
      expect(screen.getByText('重复组 0，重复书籍 0，已忽略 0')).toBeInTheDocument()
      expect(screen.getByText('暂无重复书籍')).toBeInTheDocument()
    })

    expect(screen.queryByText('检测到 7 本书籍文件已不存在')).not.toBeInTheDocument()
    expect(screen.queryByText('重复组 4，重复书籍 9，已忽略 1')).not.toBeInTheDocument()
    expect(screen.queryByText('Duplicate Book')).not.toBeInTheDocument()
  })

  it('ignores stale cleanup mutation results that resolve after a successful reset', async () => {
    const cleanupRequest = deferred<{ deleted: number }>()

    vi.mocked(adminApi.getOrphanedBooksCount).mockResolvedValue({ orphaned_books: 5 })
    vi.mocked(adminApi.cleanupOrphanedBooks).mockReturnValue(cleanupRequest.promise)

    render(<Admin />, { wrapper: createWrapper() })

    expect(await screen.findByText('检测到 5 本书籍文件已不存在')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '清理数据库' }))
    fireEvent.click(screen.getByRole('button', { name: '重置数据库' }))
    fireEvent.click(screen.getByRole('button', { name: '确认重置' }))

    await waitFor(() => {
      expect(adminApi.resetDatabase).toHaveBeenCalledTimes(1)
    })

    cleanupRequest.resolve({ deleted: 5 })

    await waitFor(() => {
      expect(screen.getByText('检测到 0 本书籍文件已不存在')).toBeInTheDocument()
    })

    expect(screen.queryByText('已删除 5 本孤立书籍')).not.toBeInTheDocument()
  })
})
