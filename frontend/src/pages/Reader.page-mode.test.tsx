import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PAGE_PARAGRAPH_GAP, getPageLayoutMetrics } from '../components/Reader/page-mode/layout'
import { measureChapterPages } from '../components/Reader/page-mode/pagination/measureChapterPages'
import Reader from './Reader'

const testState = vi.hoisted(() => {
  const targetText = 'TARGET_ANCHOR_PARAGRAPH'
  const before = Array.from({ length: 12 }, (_, index) =>
    `before-${index} ${'alpha '.repeat(36)}`
  ).join('\n\n')
  const after = Array.from({ length: 12 }, (_, index) =>
    `after-${index} ${'omega '.repeat(36)}`
  ).join('\n\n')
  const chapterText = `${before}\n\n${targetText}\n\n${after}`

  return {
    fontSize: 18,
    targetText,
    chapters: [
      {
        id: 1,
        book_id: 42,
        title: '第一章',
        position_start: 0,
        position_end: chapterText.length,
        chapter_index: 0,
      },
    ],
    contentByIndex: {
      0: chapterText,
    } as Record<number, string>,
    lastReadPosition: chapterText.indexOf(targetText),
    searchOffset: chapterText.indexOf(targetText),
  }
})

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
      last_read_position: testState.lastReadPosition,
      last_read_chapter: null,
      ai_analyzed_at: null,
      chapters: testState.chapters,
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
    fontSize: testState.fontSize,
    lineHeight: 1.7,
    theme: 'day',
    setReadingMode: vi.fn(),
    setFontSize: vi.fn(),
    setLineHeight: vi.fn(),
    setTheme: vi.fn(),
  }),
}))

vi.mock('../hooks/usePageChapterContent', () => ({
  usePageChapterContent: () => ({
    contentByIndex: testState.contentByIndex,
    errorsByIndex: {},
    loadingByIndex: Object.keys(testState.contentByIndex).reduce<Record<number, boolean>>(
      (accumulator, key) => {
        accumulator[Number(key)] = false
        return accumulator
      },
      {}
    ),
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
  Toolbar: ({
    chapters,
    onChapterClick,
    onPageJump,
    onSearchResultClick,
  }: {
    chapters?: Array<{ id: number; title: string }>
    onChapterClick?: (chapter: { id: number; title: string }) => void
    onPageJump?: (pageIndex: number) => void
    onSearchResultClick?: (offset: number, query: string) => void
  }) => (
    <>
      {onPageJump && <button onClick={() => onPageJump(2)}>jump-to-page-3</button>}
      {onChapterClick && chapters && chapters.length > 1 && (
        <button onClick={() => onChapterClick(chapters[1])}>open-chapter-2</button>
      )}
      {onSearchResultClick && (
        <button onClick={() => onSearchResultClick(testState.searchOffset, 'SEARCH_TARGET')}>
          search-second-chapter
        </button>
      )}
    </>
  ),
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

function renderReader() {
  return render(
    <MemoryRouter initialEntries={['/reader/42']}>
      <Routes>
        <Route path="/reader/:id" element={<Reader />} />
      </Routes>
    </MemoryRouter>
  )
}

function containsTargetText(content: string | null) {
  return content?.includes(testState.targetText) ?? false
}

function resetSingleChapterState() {
  const before = Array.from({ length: 12 }, (_, index) =>
    `before-${index} ${'alpha '.repeat(36)}`
  ).join('\n\n')
  const after = Array.from({ length: 12 }, (_, index) =>
    `after-${index} ${'omega '.repeat(36)}`
  ).join('\n\n')
  const chapterText = `${before}\n\n${testState.targetText}\n\n${after}`

  testState.chapters = [
    {
      id: 1,
      book_id: 42,
      title: '第一章',
      position_start: 0,
      position_end: chapterText.length,
      chapter_index: 0,
    },
  ]
  testState.contentByIndex = { 0: chapterText }
  testState.lastReadPosition = chapterText.indexOf(testState.targetText)
  testState.searchOffset = testState.lastReadPosition
}

describe('Reader page mode', () => {
  beforeEach(() => {
    testState.targetText = 'TARGET_ANCHOR_PARAGRAPH'
    testState.fontSize = 18
    resetSingleChapterState()
  })

  it('routes page mode through the new shell and hides the legacy page path', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 720 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 360 })
    testState.fontSize = 18

    renderReader()

    expect(screen.getByTestId('page-reader-stage')).toBeInTheDocument()
    await screen.findByText((content) => containsTargetText(content))
    expect(screen.queryByTestId('legacy-page-content')).not.toBeInTheDocument()
  })

  it('keeps the anchored paragraph visible after a font-size re-pagination', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 720 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 360 })
    testState.fontSize = 18

    const view = renderReader()

    await screen.findByText((content) => containsTargetText(content))

    testState.fontSize = 24
    view.rerender(
      <MemoryRouter initialEntries={['/reader/42']}>
        <Routes>
          <Route path="/reader/:id" element={<Reader />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText((content) => containsTargetText(content))).toBeInTheDocument()
    })
  })

  it('lands on the requested page when the toolbar issues a page jump', async () => {
    testState.targetText = 'PAGE_1_MARKER'
    const chapterText = [
      `PAGE_1_MARKER ${'alpha '.repeat(120)}`,
      `PAGE_2_MARKER ${'beta '.repeat(120)}`,
      `PAGE_3_MARKER ${'gamma '.repeat(120)}`,
      `PAGE_4_MARKER ${'delta '.repeat(120)}`,
    ].join('\n\n')
    testState.chapters = [
      {
        id: 1,
        book_id: 42,
        title: '第一章',
        position_start: 0,
        position_end: chapterText.length,
        chapter_index: 0,
      },
    ]
    testState.contentByIndex = { 0: chapterText }
    testState.lastReadPosition = 0

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 420 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 260 })

    const layout = getPageLayoutMetrics(420, 260)
    const expectedPage = measureChapterPages({
      chapterIndex: 0,
      text: chapterText,
      layout: {
        viewportWidth: 420,
        viewportHeight: 260,
        contentWidth: layout.contentWidth,
        contentHeight: layout.contentHeight,
        fontSize: 18,
        lineHeight: 1.7,
        paragraphGap: PAGE_PARAGRAPH_GAP,
      },
    })[2]

    expect(expectedPage).toBeDefined()
    const expectedSnippet = expectedPage!.blocks.map((block) => block.text).join(' ').slice(0, 48)

    renderReader()

    await screen.findByText((content) => content.includes('PAGE_1_MARKER'))

    fireEvent.click(screen.getByRole('button', { name: 'jump-to-page-3' }))

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes(expectedSnippet))).toBeInTheDocument()
    })
  })

  it('lands on the selected chapter when the toolbar opens the table of contents', async () => {
    const firstChapterText = `chapter-one ${'alpha '.repeat(80)}`
    const secondChapterText = `CHAPTER_TWO_MARKER ${'beta '.repeat(80)}`
    const secondChapterStart = firstChapterText.length

    testState.chapters = [
      {
        id: 1,
        book_id: 42,
        title: '第一章',
        position_start: 0,
        position_end: secondChapterStart,
        chapter_index: 0,
      },
      {
        id: 2,
        book_id: 42,
        title: '第二章',
        position_start: secondChapterStart,
        position_end: secondChapterStart + secondChapterText.length,
        chapter_index: 1,
      },
    ]
    testState.contentByIndex = {
      0: firstChapterText,
      1: secondChapterText,
    }
    testState.lastReadPosition = 0

    renderReader()

    await screen.findByText((content) => content.includes('chapter-one'))

    fireEvent.click(screen.getByRole('button', { name: 'open-chapter-2' }))

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes('CHAPTER_TWO_MARKER'))).toBeInTheDocument()
    })
  })

  it('lands on the searched page anchor in page mode', async () => {
    const firstChapterText = `chapter-one ${'alpha '.repeat(80)}`
    const secondChapterText = `SEARCH_TARGET ${'gamma '.repeat(80)}`
    const secondChapterStart = firstChapterText.length

    testState.chapters = [
      {
        id: 1,
        book_id: 42,
        title: '第一章',
        position_start: 0,
        position_end: secondChapterStart,
        chapter_index: 0,
      },
      {
        id: 2,
        book_id: 42,
        title: '第二章',
        position_start: secondChapterStart,
        position_end: secondChapterStart + secondChapterText.length,
        chapter_index: 1,
      },
    ]
    testState.contentByIndex = {
      0: firstChapterText,
      1: secondChapterText,
    }
    testState.lastReadPosition = 0
    testState.searchOffset = secondChapterStart + secondChapterText.indexOf('SEARCH_TARGET')

    renderReader()

    await screen.findByText((content) => content.includes('chapter-one'))

    fireEvent.click(screen.getByRole('button', { name: 'search-second-chapter' }))

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes('SEARCH_TARGET'))).toBeInTheDocument()
    })
  })
})
