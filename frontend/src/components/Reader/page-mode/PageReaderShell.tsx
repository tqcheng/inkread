import type { ReactNode } from 'react'

interface PageReaderShellProps {
  pageContent: ReactNode
  onPrev: () => void
  onNext: () => void
  onToggleToolbar: () => void
}

export function PageReaderShell({
  pageContent,
  onPrev,
  onNext,
  onToggleToolbar,
}: PageReaderShellProps) {
  return (
    <div className="grid h-screen grid-cols-[1fr_minmax(720px,820px)_1fr] bg-[var(--bg-color-side)]">
      <div />
      <div
        data-testid="page-reader-stage"
        className="relative h-screen pb-16 pt-14"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const x = event.clientX - rect.left
          const ratio = x / rect.width

          if (ratio < 0.3) {
            onPrev()
            return
          }

          if (ratio > 0.7) {
            onNext()
            return
          }

          onToggleToolbar()
        }}
      >
        <div className="h-full shadow-sm">{pageContent}</div>
      </div>
      <div />
    </div>
  )
}
