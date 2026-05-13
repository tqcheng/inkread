import type { MeasuredInlineBlock } from './types'
import type { PaginationLayout } from './measureChapterPages'

const PAGE_FONT_FAMILY =
  '"Iowan Old Style", "Palatino Linotype", "Noto Serif SC", "Songti SC", serif'

interface BlockHeightMeasurer {
  measure: (blocks: MeasuredInlineBlock[]) => number
  dispose: () => void
}

function applyBlockStyles(
  element: HTMLParagraphElement,
  block: MeasuredInlineBlock,
  layout: PaginationLayout
) {
  element.style.margin = `0 0 ${layout.paragraphGap}px 0`
  element.style.whiteSpace = 'pre-wrap'
  element.style.textAlign = block.kind === 'title' ? 'center' : 'left'
  element.style.fontSize =
    block.kind === 'title'
      ? `${layout.fontSize * 1.42}px`
      : `${layout.fontSize}px`
  element.style.fontWeight = block.kind === 'title' ? '600' : '400'
  element.style.letterSpacing = block.kind === 'title' ? '0.04em' : '0.01em'
  element.style.lineHeight = `${layout.lineHeight}`
  element.style.textIndent = block.kind === 'title' ? '0' : '1.8em'
}

export function createDomBlockMeasurer(
  layout: PaginationLayout
): BlockHeightMeasurer | null {
  if (typeof document === 'undefined' || !document.body) {
    return null
  }

  const container = document.createElement('div')
  container.setAttribute('data-page-measurer', 'true')
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  container.style.top = '0'
  container.style.visibility = 'hidden'
  container.style.pointerEvents = 'none'
  container.style.width = `${layout.contentWidth}px`
  container.style.boxSizing = 'border-box'
  container.style.padding = '0'
  container.style.margin = '0'
  container.style.fontFamily = PAGE_FONT_FAMILY
  container.style.fontSize = `${layout.fontSize}px`
  container.style.lineHeight = `${layout.lineHeight}`
  container.style.textRendering = 'optimizeLegibility'
  container.style.contain = 'layout style paint'
  container.style.overflow = 'hidden'
  container.style.setProperty('-webkit-font-smoothing', 'antialiased')

  document.body.appendChild(container)

  const probe = document.createElement('p')
  applyBlockStyles(
    probe,
    {
      key: 'probe',
      kind: 'paragraph',
      text: 'probe text probe text probe text',
      startOffset: 0,
      endOffset: 0,
    },
    layout
  )
  probe.textContent = 'probe text probe text probe text'
  container.appendChild(probe)
  const supportsLayout = container.scrollHeight > 0
  container.replaceChildren()

  if (!supportsLayout) {
    container.remove()
    return null
  }

  return {
    measure(blocks) {
      const fragment = document.createDocumentFragment()

      for (const block of blocks) {
        const element = document.createElement('p')
        applyBlockStyles(element, block, layout)
        element.textContent = block.text || '\u00A0'
        fragment.appendChild(element)
      }

      container.replaceChildren(fragment)
      return container.scrollHeight
    },
    dispose() {
      container.remove()
    },
  }
}
