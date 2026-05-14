import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Admin from './Admin'
import { adminApi } from '../api/admin'

const scanMocks = vi.hoisted(() => ({
  scanStatus: null as null | {
    task_id: string
    status: 'completed' | 'failed' | 'running' | 'pending'
    progress: { current: number; total: number }
    result: { scanned?: number; new_books?: number; errors?: number } | null
    error: string | null
    created_at: string | null
    started_at: string | null
    completed_at: string | null
  },
  triggerScan: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
  refetchSummary: vi.fn(),
}))

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
    refetch: scanMocks.refetchSummary,
  }),
  useScanStatus: (taskId: string | null) => ({
    data: taskId ? scanMocks.scanStatus : null,
    isLoading: false,
  }),
  useTriggerScanMutation: () => scanMocks.triggerScan,
}))

vi.mock('../components/SecuritySettingsSection', () => ({
  default: () => <div>SecuritySettingsSection</div>,
}))

function createWrapper() {
  const queryClient = new QueryClient({
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

function getByTextContent(text: string) {
  return screen.getByText((_, element) => element?.textContent === text)
}

async function findByTextContent(text: string) {
  await waitFor(() => {
    expect(getByTextContent(text)).toBeInTheDocument()
  })
  return getByTextContent(text)
}

function createDedupSummary(overrides?: Partial<{ duplicate_groups: number; duplicate_books: number; ignored_groups: number }>) {
  return {
    duplicate_groups: 1,
    duplicate_books: 2,
    ignored_groups: 3,
    ...overrides,
  }
}

function createDedupGroups() {
  return {
    items: [{
      content_md5: 'abc',
      count: 2,
      recommended_keep_book_id: 2,
      items: [
        {
          id: 1,
          title: '旧副本',
          filename: 'a.txt',
          file_path: '/books/a.txt',
          file_size: 12,
          file_mtime: null,
          is_favorite: false,
          last_read_position: 10,
          chapter_count: 4,
        },
        {
          id: 2,
          title: '保留副本',
          filename: 'b.txt',
          file_path: '/books/b.txt',
          file_size: 12,
          file_mtime: null,
          is_favorite: true,
          last_read_position: 20,
          chapter_count: 4,
        },
      ],
    }],
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

describe('Admin duplicate management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scanMocks.scanStatus = null
    scanMocks.triggerScan.isPending = false
    scanMocks.triggerScan.mutateAsync.mockResolvedValue({ task_id: 'scan-task-1' })

    vi.mocked(adminApi.getOrphanedBooksCount).mockResolvedValue({ orphaned_books: 0 })
    vi.mocked(adminApi.getDedupSummary).mockResolvedValue(createDedupSummary())
    vi.mocked(adminApi.getDedupGroups).mockResolvedValue(createDedupGroups())
    vi.mocked(adminApi.resolveDedupGroup).mockResolvedValue({
      content_md5: 'abc',
      keep_book_id: 2,
      deleted_book_ids: [1],
      mode: 'soft_delete',
      delete_source_files: false,
      file_results: [],
    })
  })

  it('shows a loading state while dedup data is being fetched', async () => {
    const summaryRequest = deferred<ReturnType<typeof createDedupSummary>>()
    const groupsRequest = deferred<ReturnType<typeof createDedupGroups>>()

    vi.mocked(adminApi.getDedupSummary).mockReturnValue(summaryRequest.promise)
    vi.mocked(adminApi.getDedupGroups).mockReturnValue(groupsRequest.promise)

    render(<Admin />, { wrapper: createWrapper() })

    expect(await screen.findByText('重复书籍加载中...')).toBeInTheDocument()
    expect(screen.queryByText('暂无重复书籍')).not.toBeInTheDocument()

    summaryRequest.resolve(createDedupSummary())
    groupsRequest.resolve(createDedupGroups())

    await findByTextContent('重复组 1，重复书籍 2，已忽略 3')
  })

  it('shows an error state when dedup data fails to load', async () => {
    vi.mocked(adminApi.getDedupSummary).mockRejectedValue(new Error('boom'))

    render(<Admin />, { wrapper: createWrapper() })

    expect(await screen.findByText('重复书籍加载失败，请稍后重试')).toBeInTheDocument()
    expect(screen.queryByText('暂无重复书籍')).not.toBeInTheDocument()
  })

  it('refreshes dedup data after scan completion', async () => {
    scanMocks.scanStatus = {
      task_id: 'scan-task-1',
      status: 'completed',
      progress: { current: 2, total: 2 },
      result: { scanned: 2, new_books: 1, errors: 0 },
      error: null,
      created_at: '2026-05-14T00:00:00Z',
      started_at: '2026-05-14T00:00:00Z',
      completed_at: '2026-05-14T00:01:00Z',
    }

    vi.mocked(adminApi.getDedupSummary)
      .mockResolvedValueOnce(createDedupSummary({ duplicate_groups: 1, duplicate_books: 2, ignored_groups: 3 }))
      .mockResolvedValueOnce(createDedupSummary({ duplicate_groups: 4, duplicate_books: 8, ignored_groups: 1 }))
    vi.mocked(adminApi.getDedupGroups)
      .mockResolvedValueOnce(createDedupGroups())
      .mockResolvedValueOnce({ items: [] })

    render(<Admin />, { wrapper: createWrapper() })

    expect(await findByTextContent('重复组 1，重复书籍 2，已忽略 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '一键扫描' }))

    await waitFor(() => {
      expect(adminApi.getDedupSummary).toHaveBeenCalledTimes(2)
      expect(adminApi.getDedupGroups).toHaveBeenCalledTimes(2)
    })

    expect(await findByTextContent('重复组 4，重复书籍 8，已忽略 1')).toBeInTheDocument()
    expect(screen.getByText('暂无重复书籍')).toBeInTheDocument()
  })

  it('resolves with file deletion disabled by default', async () => {
    render(<Admin />, { wrapper: createWrapper() })

    expect(await findByTextContent('重复组 1，重复书籍 2，已忽略 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /展开重复组/i }))
    fireEvent.click(await screen.findByLabelText('保留副本'))
    fireEvent.click(screen.getByRole('button', { name: '软删除其余' }))

    await waitFor(() => {
      expect(adminApi.resolveDedupGroup).toHaveBeenCalledWith({
        content_md5: 'abc',
        keep_book_id: 2,
        delete_book_ids: [1],
        mode: 'soft_delete',
        delete_source_files: false,
      })
    })
  })
})
