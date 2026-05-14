import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Admin from './Admin'
import { adminApi } from '../api/admin'

vi.mock('../api/admin', () => ({
  adminApi: {
    getOrphanedBooksCount: vi.fn().mockResolvedValue({ orphaned_books: 0 }),
    getDedupSummary: vi.fn().mockResolvedValue({
      duplicate_groups: 1,
      duplicate_books: 2,
      ignored_groups: 0,
    }),
    getDedupGroups: vi.fn().mockResolvedValue({
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
    }),
    resolveDedupGroup: vi.fn().mockResolvedValue({
      content_md5: 'abc',
      keep_book_id: 2,
      deleted_book_ids: [1],
      mode: 'soft_delete',
      delete_source_files: false,
      file_results: [],
    }),
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

describe('Admin duplicate management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders duplicate groups and resolves with file deletion disabled by default', async () => {
    render(<Admin />, { wrapper: createWrapper() })

    expect(await screen.findByText('重复书籍')).toBeInTheDocument()

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
