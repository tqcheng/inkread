import type { ReactNode } from 'react'
import {
  PAGE_BOTTOM_CHROME_HEIGHT,
  PAGE_STAGE_MAX_WIDTH,
  PAGE_TOP_CHROME_HEIGHT,
} from './layout'

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
    <div className="flex h-screen justify-center bg-[var(--bg-color-side)]">
      <div
        data-testid="page-reader-stage"
        className="relative h-screen"
        style={{
          width: '100%',
          maxWidth: `${PAGE_STAGE_MAX_WIDTH}px`,
          paddingTop: `${PAGE_TOP_CHROME_HEIGHT}px`,
          paddingBottom: `${PAGE_BOTTOM_CHROME_HEIGHT}px`,
        }}
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
    </div>
  )
}
