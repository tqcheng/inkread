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
          backgroundColor: '#fbbf24',
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
      }}
    >
      {page.blocks.map((block) => (
        <p
          key={block.key}
          className="whitespace-pre-wrap"
          style={{
            margin: `0 0 ${PAGE_PARAGRAPH_GAP}px 0`,
            textAlign: block.kind === 'title' ? 'center' : 'left',
            fontSize:
              block.kind === 'title' ? `${PAGE_TITLE_FONT_SCALE}em` : undefined,
            fontWeight: block.kind === 'title' ? 600 : undefined,
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
