import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
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
  showToolbar: boolean
  pageKey: string
  transitionDirection: 'forward' | 'backward' | 'none'
}

export function PageReaderShell({
  pageContent,
  onPrev,
  onNext,
  onToggleToolbar,
  showToolbar,
  pageKey,
  transitionDirection,
}: PageReaderShellProps) {
  const [hoverZone, setHoverZone] = useState<'prev' | 'next' | 'center' | null>(
    null
  )
  const hoverZoneRef = useRef<'prev' | 'next' | 'center' | null>(null)

  const resolveZone = (clientX: number, left: number, width: number) => {
    const x = clientX - left
    const ratio = x / width

    if (ratio < 0.3) {
      return 'prev'
    }

    if (ratio > 0.7) {
      return 'next'
    }

    return 'center'
  }

  return (
    <div
      className="flex h-screen justify-center bg-[radial-gradient(circle_at_top,_color-mix(in_srgb,var(--bg-color-side)_82%,white_18%)_0%,var(--bg-color-side)_48%,color-mix(in_srgb,var(--bg-color-side)_90%,black_10%)_100%)] px-4 sm:px-6 lg:px-10"
    >
      <style>{`
        @keyframes page-slide-forward {
          0% {
            opacity: 0;
            transform: translate3d(18px, 0, 0);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes page-slide-backward {
          0% {
            opacity: 0;
            transform: translate3d(-18px, 0, 0);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          [data-page-animation] {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
      <div
        data-testid="page-reader-stage"
        className="relative h-screen w-full transition-[filter] duration-200"
        style={{
          maxWidth: `${PAGE_STAGE_MAX_WIDTH}px`,
          paddingTop: `${PAGE_TOP_CHROME_HEIGHT}px`,
          paddingBottom: `${PAGE_BOTTOM_CHROME_HEIGHT}px`,
        }}
        onMouseLeave={() => {
          hoverZoneRef.current = null
          setHoverZone(null)
        }}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const nextZone = resolveZone(event.clientX, rect.left, rect.width)

          if (hoverZoneRef.current !== nextZone) {
            hoverZoneRef.current = nextZone
            setHoverZone(nextZone)
          }
        }}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const zone = resolveZone(event.clientX, rect.left, rect.width)

          if (zone === 'prev') {
            onPrev()
            return
          }

          if (zone === 'next') {
            onNext()
            return
          }

          onToggleToolbar()
        }}
      >
        <div
          className="absolute inset-x-0 bottom-5 flex justify-center pointer-events-none transition-opacity duration-200"
          style={{ opacity: showToolbar ? 0 : hoverZone === 'center' ? 1 : 0.42 }}
        >
          <div
            className="rounded-full border px-3 py-1 text-xs tracking-[0.18em]"
            style={{
              borderColor: 'var(--reader-toolbar-border)',
              backgroundColor: 'var(--reader-toolbar-bg)',
              color: 'var(--text-color)',
              backdropFilter: 'blur(16px)',
            }}
          >
            {hoverZone === 'center' ? '显示菜单' : '阅读中'}
          </div>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-[88px] left-0 right-0 flex justify-between overflow-hidden"
        >
          <div
            className="flex w-[30%] items-center justify-start pl-4 transition-opacity duration-150"
            style={{
              opacity: hoverZone === 'prev' ? 1 : 0,
              background:
                'linear-gradient(90deg, color-mix(in srgb, var(--bg-color-side) 34%, transparent) 0%, transparent 78%)',
            }}
          >
            <span className="rounded-full px-3 py-1 text-xs tracking-[0.18em] text-[var(--text-color)]">
              上一页
            </span>
          </div>
          <div
            className="flex w-[30%] items-center justify-end pr-4 transition-opacity duration-150"
            style={{
              opacity: hoverZone === 'next' ? 1 : 0,
              background:
                'linear-gradient(270deg, color-mix(in srgb, var(--bg-color-side) 34%, transparent) 0%, transparent 78%)',
            }}
          >
            <span className="rounded-full px-3 py-1 text-xs tracking-[0.18em] text-[var(--text-color)]">
              下一页
            </span>
          </div>
        </div>

        <div
          className="h-full overflow-hidden rounded-[28px] border"
          style={{
            boxShadow: 'var(--reader-stage-shadow)',
            borderColor: 'var(--reader-stage-border)',
            backgroundColor: 'var(--bg-color)',
          }}
        >
          <div className="h-full overflow-hidden">
            <div
              key={pageKey}
              data-testid="page-reader-content"
              data-page-animation={transitionDirection}
              data-direction={transitionDirection}
              className="h-full transition-transform duration-150"
              style={{
                transform:
                  hoverZone === 'prev'
                    ? 'translateX(3px)'
                    : hoverZone === 'next'
                      ? 'translateX(-3px)'
                      : 'translateX(0)',
                animation:
                  transitionDirection === 'forward'
                    ? 'page-slide-forward 170ms cubic-bezier(0.22, 0.61, 0.36, 1)'
                    : transitionDirection === 'backward'
                      ? 'page-slide-backward 170ms cubic-bezier(0.22, 0.61, 0.36, 1)'
                      : 'none',
              }}
            >
              {pageContent}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
