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

    fireEvent.change(screen.getByLabelText('跳转到页码'), {
      target: { value: '3abc' },
    })
    fireEvent.click(screen.getByRole('button', { name: '跳转页码' }))

    expect(onPageJump).not.toHaveBeenCalled()
  })
})
