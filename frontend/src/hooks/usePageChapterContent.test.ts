import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { booksApi } from '../api/books'
import type { Chapter } from '../api/types'
import { usePageChapterContent } from './usePageChapterContent'

vi.mock('../api/books', () => ({
  booksApi: {
    getBookContent: vi.fn(),
  },
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
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('usePageChapterContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keys content by chapter array position instead of stored chapter_index', async () => {
    const chapters: Chapter[] = [
      { id: 11, book_id: 7, title: 'A', position_start: 0, position_end: 100, chapter_index: 10 },
      { id: 12, book_id: 7, title: 'B', position_start: 100, position_end: 200, chapter_index: 30 },
      { id: 13, book_id: 7, title: 'C', position_start: 200, position_end: null, chapter_index: 50 },
    ]

    vi.mocked(booksApi.getBookContent)
      .mockResolvedValueOnce({ book_id: 7, content: 'chapter-a', next_offset: null, is_end: true })
      .mockResolvedValueOnce({ book_id: 7, content: 'chapter-b', next_offset: null, is_end: true })
      .mockResolvedValueOnce({ book_id: 7, content: 'chapter-c', next_offset: null, is_end: true })

    const { result } = renderHook(() => usePageChapterContent(7, chapters, 1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.contentByIndex[0]).toBe('chapter-a')
      expect(result.current.contentByIndex[1]).toBe('chapter-b')
      expect(result.current.contentByIndex[2]).toBe('chapter-c')
    })

    expect(result.current.contentByIndex[10]).toBeUndefined()
    expect(result.current.errorsByIndex[0]).toBeNull()
    expect(result.current.errorsByIndex[1]).toBeNull()
    expect(result.current.errorsByIndex[2]).toBeNull()
    expect(booksApi.getBookContent).toHaveBeenNthCalledWith(1, 7, 0, 10000, 10)
    expect(booksApi.getBookContent).toHaveBeenNthCalledWith(2, 7, 0, 10000, 30)
    expect(booksApi.getBookContent).toHaveBeenNthCalledWith(3, 7, 0, 10000, 50)
  })

  it('surfaces an explicit error when chapter_index metadata is missing', async () => {
    const chapters: Chapter[] = [
      { id: 21, book_id: 8, title: 'A', position_start: 0, position_end: 100, chapter_index: 0 },
      { id: 22, book_id: 8, title: 'B', position_start: 100, position_end: 200, chapter_index: null },
      { id: 23, book_id: 8, title: 'C', position_start: 200, position_end: null, chapter_index: 2 },
    ]

    vi.mocked(booksApi.getBookContent)
      .mockResolvedValueOnce({ book_id: 8, content: 'chapter-a', next_offset: null, is_end: true })
      .mockResolvedValueOnce({ book_id: 8, content: 'chapter-c', next_offset: null, is_end: true })

    const { result } = renderHook(() => usePageChapterContent(8, chapters, 1), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.errorsByIndex[1]).toContain('missing chapter_index metadata')
    })

    expect(result.current.contentByIndex[0]).toBe('chapter-a')
    expect(result.current.contentByIndex[1]).toBe('')
    expect(result.current.contentByIndex[2]).toBe('chapter-c')
    expect(booksApi.getBookContent).toHaveBeenCalledTimes(2)
    expect(booksApi.getBookContent).toHaveBeenNthCalledWith(1, 8, 0, 10000, 0)
    expect(booksApi.getBookContent).toHaveBeenNthCalledWith(2, 8, 0, 10000, 2)
  })
})
