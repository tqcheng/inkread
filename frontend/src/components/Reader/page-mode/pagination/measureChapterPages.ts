import { tokenizeChapter } from './tokenizeChapter'
import type { MeasuredInlineBlock, MeasuredPage } from './types'

interface PaginationLayout {
  viewportWidth: number
  viewportHeight: number
  contentWidth: number
  contentHeight: number
  fontSize: number
  lineHeight: number
  paragraphGap: number
}

interface MeasureChapterPagesInput {
  chapterIndex: number
  text: string
  layout: PaginationLayout
}

function countVisualUnits(text: string): number {
  let units = 0

  for (const char of text) {
    units += char.charCodeAt(0) > 255 ? 2 : 1
  }

  return units
}

function estimateBlockHeight(
  block: MeasuredInlineBlock,
  layout: PaginationLayout
): number {
  const charsPerLine = Math.max(8, Math.floor(layout.contentWidth / layout.fontSize))
  const visualLines =
    block.kind === 'blank'
      ? 1
      : Math.max(1, Math.ceil(countVisualUnits(block.text) / charsPerLine))
  const titleBoost = block.kind === 'title' ? 1.35 : 1

  return visualLines * layout.fontSize * layout.lineHeight * titleBoost + layout.paragraphGap
}

function splitOversizedBlock(
  block: MeasuredInlineBlock,
  layout: PaginationLayout,
  remainingHeight: number
): MeasuredInlineBlock {
  const charsPerLine = Math.max(8, Math.floor(layout.contentWidth / layout.fontSize))
  const linesThatFit = Math.max(
    1,
    Math.floor(remainingHeight / (layout.fontSize * layout.lineHeight))
  )
  const maxUnits = Math.max(charsPerLine, charsPerLine * linesThatFit)
  let sliceLength = 0
  let sliceUnits = 0

  while (sliceLength < block.text.length && sliceUnits < maxUnits) {
    sliceUnits += countVisualUnits(block.text[sliceLength])
    sliceLength += 1
  }

  const text = block.text.slice(0, sliceLength)

  return {
    ...block,
    text,
    endOffset: block.startOffset + text.length,
  }
}

export function measureChapterPages(input: MeasureChapterPagesInput): MeasuredPage[] {
  const blocks = tokenizeChapter(input.text)
  const pages: MeasuredPage[] = []
  const maxHeight = input.layout.contentHeight
  let pageBlocks: MeasuredInlineBlock[] = []
  let pageHeight = 0

  const pushPage = () => {
    if (pageBlocks.length === 0) return

    const startOffset = pageBlocks[0].startOffset
    const endOffset = pageBlocks[pageBlocks.length - 1].endOffset

    pages.push({
      chapterIndex: input.chapterIndex,
      pageInChapter: pages.length,
      startOffset,
      endOffset,
      anchorOffset: startOffset,
      blocks: pageBlocks,
    })

    pageBlocks = []
    pageHeight = 0
  }

  for (const block of blocks) {
    const blockHeight = estimateBlockHeight(block, input.layout)

    if (pageHeight > 0 && pageHeight + blockHeight > maxHeight && block.kind === 'title') {
      pushPage()
    }

    if (pageHeight > 0 && pageHeight + blockHeight > maxHeight) {
      pushPage()
    }

    if (blockHeight > maxHeight) {
      let remainder = block.text
      let remainderStartOffset = block.startOffset
      let sliceIndex = 0

      while (remainder.length > 0) {
        const slicedBlock = splitOversizedBlock(
          {
            ...block,
            key: `${block.key}-slice-${sliceIndex}`,
            text: remainder,
            startOffset: remainderStartOffset,
            endOffset: remainderStartOffset + remainder.length,
          },
          input.layout,
          maxHeight
        )

        pageBlocks.push(slicedBlock)
        pushPage()

        remainder = remainder.slice(slicedBlock.text.length)
        remainderStartOffset = slicedBlock.endOffset
        sliceIndex += 1
      }

      continue
    }

    pageBlocks.push(block)
    pageHeight += blockHeight
  }

  pushPage()
  return pages
}
