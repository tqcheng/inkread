import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Toolbar } from './Toolbar'

const mockReaderSettings = {
  readingMode: 'page',
  fontSize: 18,
  lineHeight: 1.7,
  theme: 'day',
  setReadingMode: vi.fn(),
  setFontSize: vi.fn(),
  setLineHeight: vi.fn(),
  setTheme: vi.fn(),
}

vi.mock('../../hooks/useReaderSettings', () => ({
  useReaderSettings: () => mockReaderSettings,
}))

vi.mock('../../hooks/useBookSearch', () => ({
  useBookSearch: () => ({
    data: { results: [] },
    isLoading: false,
    error: null,
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom'
  )

  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

describe('Toolbar', () => {
  beforeEach(() => {
    mockReaderSettings.readingMode = 'page'
    vi.clearAllMocks()
  })

  it('enables prev/next buttons when navigation is possible', () => {
    render(
      <MemoryRouter>
        <Toolbar
          show
          bookId={42}
          currentPage={0}
          totalPages={5}
          canPrev={true}
          canNext={false}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: '上一页' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  })

  it('submits page jumps with 1-based input mapped to zero-based page indexes', () => {
    const onPageJump = vi.fn()

    render(
      <MemoryRouter>
        <Toolbar
          show
          bookId={42}
          currentPage={0}
          totalPages={5}
          onPageJump={onPageJump}
        />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByTitle('设置'))
    fireEvent.change(screen.getByLabelText('跳转到页码'), {
      target: { value: '3' },
    })
    fireEvent.click(screen.getByRole('button', { name: '跳转页码' }))

    expect(onPageJump).toHaveBeenCalledWith(2)
  })

  it('ignores invalid page-jump input', () => {
    const onPageJump = vi.fn()

    render(
      <MemoryRouter>
        <Toolbar
          show
          bookId={42}
          currentPage={1}
          totalPages={5}
          onPageJump={onPageJump}
        />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByTitle('设置'))
    fireEvent.change(screen.getByLabelText('跳转到页码'), {
      target: { value: '3abc' },
    })
    fireEvent.click(screen.getByRole('button', { name: '跳转页码' }))

    expect(onPageJump).not.toHaveBeenCalled()
  })

  it('keeps page jump and reading settings inside the settings panel', () => {
    render(
      <MemoryRouter>
        <Toolbar
          show
          bookId={42}
          currentPage={1}
          totalPages={5}
          currentChapterTitle="第一章"
          onPageJump={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.queryByLabelText('跳转到页码')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '16' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '白天' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByTitle('设置'))

    expect(screen.getByLabelText('跳转到页码')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '16' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '白天' })).toBeInTheDocument()
  })

  it('shows the settings drawer in scroll mode without page navigation controls', () => {
    mockReaderSettings.readingMode = 'scroll'

    render(
      <MemoryRouter>
        <Toolbar
          show
          bookId={42}
          currentPage={1}
          totalPages={5}
          currentChapterTitle="第一章"
          onPageJump={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByTitle('设置')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '上一页' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下一页' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByTitle('设置'))

    expect(screen.getByRole('heading', { name: '阅读设置' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '16' })).toBeInTheDocument()
    expect(screen.queryByLabelText('跳转到页码')).not.toBeInTheDocument()
  })

  it('keeps right-side panels mutually exclusive', () => {
    render(
      <MemoryRouter>
        <Toolbar
          show
          bookId={42}
          currentPage={1}
          totalPages={5}
          chapters={[
            {
              id: 1,
              book_id: 42,
              chapter_index: 0,
              title: '第一章',
              position_start: 0,
              position_end: 100,
            },
          ]}
        />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByTitle('目录'))
    expect(screen.getByRole('heading', { name: '目录' })).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('设置'))
    expect(screen.queryByRole('heading', { name: '目录' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '阅读设置' })).toBeInTheDocument()
  })

  it('closes the settings drawer when the backdrop is clicked', () => {
    render(
      <MemoryRouter>
        <Toolbar
          show
          bookId={42}
          currentPage={1}
          totalPages={5}
          onPageJump={vi.fn()}
        />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByTitle('设置'))
    expect(screen.getByRole('heading', { name: '阅读设置' })).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-backdrop'))
    expect(screen.queryByRole('heading', { name: '阅读设置' })).not.toBeInTheDocument()
  })

  it('disables toolbar pointer events when hidden', () => {
    const { container } = render(
      <MemoryRouter>
        <Toolbar
          show={false}
          bookId={42}
          currentPage={0}
          totalPages={5}
          onPageJump={vi.fn()}
        />
      </MemoryRouter>
    )

    const interactiveChrome = container.querySelectorAll('.pointer-events-auto')
    expect(interactiveChrome).toHaveLength(0)
  })
})
