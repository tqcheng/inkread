import type { MeasuredPage } from './pagination/types'

interface PageContentProps {
  page: MeasuredPage
  highlight?: string | null
}

export function PageContent({ page, highlight }: PageContentProps) {
  return (
    <div className="h-full w-full bg-[var(--bg-color)] px-8 py-10 text-[var(--text-color)]">
      {page.blocks.map((block) => (
        <p
          key={block.key}
          className={
            block.kind === 'title'
              ? 'my-8 text-center text-[1.15em] font-semibold'
              : 'my-4 whitespace-pre-wrap'
          }
        >
          {highlight ? block.text.replace(highlight, highlight) : block.text || '\u00A0'}
        </p>
      ))}
    </div>
  )
}
