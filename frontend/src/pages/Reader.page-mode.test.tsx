import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Reader from './Reader'

vi.mock('../hooks/useBooks', () => ({
  useBookQuery: () => ({
    data: {
      id: 42,
      title: '测试书籍',
      filename: 'reader.txt',
      file_path: '/tmp/reader.txt',
      file_size: 123,
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
      last_read_position: 12,
      last_read_chapter: null,
      ai_analyzed_at: null,
      chapters: [
        {
          id: 1,
          book_id: 42,
          title: '第一章',
          position_start: 0,
          position_end: 100,
          chapter_index: 0,
        },
      ],
    },
  }),
  useBookContentQuery: () => ({
    data: {
      book_id: 42,
      content: 'legacy page content',
      next_offset: null,
      is_end: true,
    },
  }),
}))

vi.mock('../hooks/useReaderSettings', () => ({
  useReaderSettings: () => ({
    readingMode: 'page',
    fontSize: 18,
    lineHeight: 1.7,
    theme: 'day',
    setReadingMode: vi.fn(),
    setFontSize: vi.fn(),
    setLineHeight: vi.fn(),
    setTheme: vi.fn(),
  }),
}))

vi.mock('../hooks/useTextPagination', () => ({
  useTextPagination: () => ({
    pages: [{ content: 'legacy page content' }],
    currentPage: 0,
    totalPages: 1,
    goToNext: vi.fn(),
    goToPrev: vi.fn(),
    goToOffset: vi.fn(),
  }),
}))

vi.mock('../hooks/usePageChapterContent', () => ({
  usePageChapterContent: () => ({
    contentByIndex: {
      0: 'chapter text from page content hook',
    },
    errorsByIndex: {},
    loadingByIndex: {
      0: false,
    },
  }),
}))

vi.mock('../components/Reader/page-mode/usePageReaderController', () => ({
  usePageReaderController: () => ({
    pages: [
      {
        chapterIndex: 0,
        pageInChapter: 0,
        startOffset: 0,
        endOffset: 18,
        anchorOffset: 0,
        blocks: [
          {
            key: 'page-0',
            kind: 'paragraph',
            text: 'controller page text',
            startOffset: 0,
            endOffset: 18,
          },
        ],
      },
    ],
    currentPage: {
      chapterIndex: 0,
      pageInChapter: 0,
      startOffset: 0,
      endOffset: 18,
      anchorOffset: 0,
      blocks: [
        {
          key: 'page-0',
          kind: 'paragraph',
          text: 'controller page text',
          startOffset: 0,
          endOffset: 18,
        },
      ],
    },
    currentPageIndex: 0,
    setCurrentPageIndex: vi.fn(),
    anchorOffset: 0,
    setAnchorOffset: vi.fn(),
  }),
}))

vi.mock('../components/Reader/page-mode/PageReaderShell', () => ({
  PageReaderShell: ({ pageContent }: { pageContent: ReactNode }) => (
    <div data-testid="page-reader-stage">{pageContent}</div>
  ),
}))

vi.mock('../components/Reader/page-mode/PageContent', () => ({
  PageContent: ({ page }: { page: { blocks: Array<{ text: string }> } }) => (
    <div>{page.blocks.map((block) => block.text).join(' ')}</div>
  ),
}))

vi.mock('../components/Reader/Toolbar', () => ({
  Toolbar: () => null,
}))

vi.mock('../components/Reader/ThemeProvider', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('../components/Reader/TextContent', () => ({
  TextContent: ({ content }: { content: string }) => (
    <div data-testid="legacy-page-content">{content}</div>
  ),
}))

vi.mock('../components/LoginOverlay', () => ({
  default: () => null,
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    token: null,
    isEnabled: false,
    isLoading: false,
    checkStatus: vi.fn(),
  }),
}))

describe('Reader page mode', () => {
  it('renders the page-mode shell and controller page content when reading mode is page', () => {
    render(
      <MemoryRouter initialEntries={['/reader/42']}>
        <Routes>
          <Route path="/reader/:id" element={<Reader />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId('page-reader-stage')).toBeInTheDocument()
    expect(screen.getByText('controller page text')).toBeInTheDocument()
    expect(screen.queryByTestId('legacy-page-content')).not.toBeInTheDocument()
  })
})
