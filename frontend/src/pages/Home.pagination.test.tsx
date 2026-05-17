import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Book, BookListResponse, GetBooksParams } from '../api/types'
import Home from './Home'

const uiState = {
  viewMode: 'grid' as const,
  isAdminMode: false,
  selectedBooks: new Set<number>(),
  sortBy: 'created_at',
  sortOrder: 'desc' as const,
  actions: {
    setViewMode: vi.fn(),
    toggleAdminMode: vi.fn(),
    toggleBookSelection: vi.fn(),
    clearSelection: vi.fn(),
    setSort: vi.fn(),
  },
}

const queryState = vi.hoisted(() => ({
  mode: 'stable' as 'stable' | 'shrunk',
  resolvedShrunkPage: false,
}))

const renderState = vi.hoisted(() => ({
  sortSelectorProps: [] as Array<{ currentPage: number; totalPages: number }>,
  paginationProps: [] as Array<{ currentPage: number; totalPages: number }>,
}))

function makeBook(id: number): Book {
  return {
    id,
    title: `Book ${id}`,
    filename: `book-${id}.txt`,
    file_path: `/tmp/book-${id}.txt`,
    file_size: 1000,
    category: null,
    category_confidence: null,
    tags: null,
    tags_source: null,
    encoding_original: 'utf-8',
    is_utf8_converted: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    is_favorite: false,
    is_deleted: false,
    last_read_position: 0,
    last_read_chapter: null,
    ai_analyzed_at: null,
  }
}

function makeResponse(page: number, pages: number): BookListResponse {
  return {
    items: [makeBook(page)],
    total: pages * 20,
    page,
    page_size: 20,
    pages,
  }
}

const useBooksQueryMock = vi.fn((params: GetBooksParams = {}) => {
  const currentPage = params.page ?? 1
  const pages = queryState.mode === 'stable' ? 3 : 2

  if (queryState.mode === 'shrunk') {
    if (currentPage > pages) {
      return {
        data: {
          items: [],
          total: pages * 20,
          page: currentPage,
          page_size: 20,
          pages,
        },
        isLoading: false,
        error: null,
      }
    }

    if (!queryState.resolvedShrunkPage) {
      queryState.resolvedShrunkPage = true
      return {
        data: undefined,
        isLoading: true,
        error: null,
      }
    }
  }

  return {
    data: makeResponse(currentPage, pages),
    isLoading: false,
    error: null,
  }
})

vi.mock('../hooks/useBooks', () => ({
  useBooksQuery: (params: GetBooksParams) => useBooksQueryMock(params),
  useToggleFavoriteMutation: () => ({
    mutate: vi.fn(),
  }),
}))

vi.mock('../store/useUIStore', () => ({
  useUIStore: (selector?: (state: typeof uiState) => unknown) =>
    selector ? selector(uiState) : uiState,
}))

vi.mock('../hooks/useAdmin', () => ({
  useAdminStore: () => ({
    disableAdminMode: vi.fn(),
  }),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    token: null,
    isEnabled: false,
    isLoading: false,
    checkStatus: vi.fn(),
  }),
}))

vi.mock('../api/admin', () => ({
  adminApi: {
    batchDelete: vi.fn(),
  },
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}))

vi.mock('../components/SearchBar', () => ({
  default: () => <div>SearchBar</div>,
}))

vi.mock('../components/TagFilter', () => ({
  default: () => <div>TagFilter</div>,
}))

vi.mock('../components/ViewToggle', () => ({
  default: () => <div>ViewToggle</div>,
}))

vi.mock('../components/SortSelector', () => ({
  default: ({
    currentPage,
    totalPages,
    onPageChange,
  }: {
    currentPage: number
    totalPages: number
    onPageChange: (page: number) => void
  }) => {
    renderState.sortSelectorProps.push({ currentPage, totalPages })

    return totalPages > 1 ? (
      <select
        aria-label="跳转到结果页"
        value={currentPage}
        onChange={(event) => onPageChange(Number(event.target.value))}
      >
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
          <option key={page} value={page}>
            第 {page} 页
          </option>
        ))}
      </select>
    ) : null
  },
}))

vi.mock('../components/Pagination', () => ({
  default: ({
    currentPage,
    totalPages,
  }: {
    currentPage: number
    totalPages: number
  }) => {
    renderState.paginationProps.push({ currentPage, totalPages })
    return totalPages > 1 ? <div>{currentPage} / {totalPages}</div> : null
  },
}))

vi.mock('../components/BookCard', () => ({
  default: ({ book }: { book: Book }) => <div>{book.title}</div>,
}))

vi.mock('../components/AdminBar', () => ({
  default: () => null,
}))

vi.mock('../components/LoginOverlay', () => ({
  default: () => null,
}))

describe('Home pagination sync', () => {
  it('clamps the current page when the result set shrinks and keeps header and footer in sync', async () => {
    queryState.mode = 'stable'
    queryState.resolvedShrunkPage = false
    useBooksQueryMock.mockClear()
    renderState.sortSelectorProps = []
    renderState.paginationProps = []

    const { rerender } = render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('跳转到结果页'), {
      target: { value: '3' },
    })

    await waitFor(() => {
      expect(screen.getByLabelText('跳转到结果页')).toHaveValue('3')
    })
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    renderState.sortSelectorProps = []
    renderState.paginationProps = []

    queryState.mode = 'shrunk'
    rerender(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    )

    expect(screen.queryByText('暂无书籍')).not.toBeInTheDocument()
    expect(screen.getByText('加载中...')).toBeInTheDocument()
    expect(screen.queryByText('3 / 2')).not.toBeInTheDocument()
    expect(renderState.sortSelectorProps).not.toContainEqual({ currentPage: 3, totalPages: 2 })
    expect(renderState.paginationProps).not.toContainEqual({ currentPage: 3, totalPages: 2 })

    rerender(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByLabelText('跳转到结果页')).toHaveValue('2')
    })
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    expect(screen.getByText('Book 2')).toBeInTheDocument()
    expect(screen.queryByText('暂无书籍')).not.toBeInTheDocument()
    expect(renderState.sortSelectorProps).toContainEqual({ currentPage: 2, totalPages: 2 })
    expect(renderState.paginationProps).toContainEqual({ currentPage: 2, totalPages: 2 })

    expect(useBooksQueryMock).toHaveBeenCalledWith(expect.objectContaining({ page: 3 }))
    expect(useBooksQueryMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })
})
