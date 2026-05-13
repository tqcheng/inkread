import type { ReactNode } from 'react'
import { useReaderSettings } from '../../../hooks/useReaderSettings'
import {
  PAGE_HORIZONTAL_PADDING,
  PAGE_PARAGRAPH_GAP,
  PAGE_TITLE_FONT_SCALE,
  PAGE_VERTICAL_PADDING,
} from './layout'
import type { MeasuredPage } from './pagination/types'

interface PageContentProps {
  page: MeasuredPage
  highlight?: string | null
}

function renderHighlightedText(text: string, highlight: string): ReactNode {
  const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))

  return parts.map((part, index) =>
    part.toLowerCase() === highlight.toLowerCase() ? (
      <mark
        key={`${part}-${index}`}
        style={{
          backgroundColor: 'var(--reader-highlight)',
          borderRadius: '2px',
          padding: '0 1px',
        }}
      >
        {part}
      </mark>
    ) : (
      part
    )
  )
}

export function PageContent({ page, highlight }: PageContentProps) {
  const { fontSize, lineHeight } = useReaderSettings()

  return (
    <div
      className="h-full w-full bg-[var(--bg-color)] text-[var(--text-color)]"
      style={{
        boxSizing: 'border-box',
        padding: `${PAGE_VERTICAL_PADDING}px ${PAGE_HORIZONTAL_PADDING}px`,
        fontSize: `${fontSize}px`,
        lineHeight: `${lineHeight}`,
        fontFamily:
          '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", "Songti SC", serif',
        textRendering: 'optimizeLegibility',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {page.blocks.map((block) => (
        <p
          key={block.key}
          className="whitespace-pre-wrap transition-colors duration-150"
          style={{
            margin: `0 0 ${PAGE_PARAGRAPH_GAP}px 0`,
            textAlign: block.kind === 'title' ? 'center' : 'left',
            fontSize:
              block.kind === 'title' ? `${PAGE_TITLE_FONT_SCALE}em` : undefined,
            fontWeight: block.kind === 'title' ? 600 : undefined,
            letterSpacing: block.kind === 'title' ? '0.04em' : '0.01em',
            color:
              block.kind === 'title'
                ? 'color-mix(in srgb, var(--text-color) 92%, black 8%)'
                : 'var(--text-color)',
            textIndent: block.kind === 'title' ? 0 : '1.8em',
            opacity: block.kind === 'title' ? 0.96 : 1,
          }}
        >
          {highlight && block.text
            ? renderHighlightedText(block.text, highlight)
            : block.text || '\u00A0'}
        </p>
      ))}
    </div>
  )
}
