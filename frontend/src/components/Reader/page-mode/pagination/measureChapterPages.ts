import { tokenizeChapter } from './tokenizeChapter'
import type { MeasuredInlineBlock, MeasuredPage } from './types'

export interface PaginationLayout {
  viewportWidth: number
  viewportHeight: number
  contentWidth: number
  contentHeight: number
  fontSize: number
  lineHeight: number
  paragraphGap: number
}

export interface MeasureChapterPagesInput {
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

function estimateKeepWithNextHeight(
  blocks: MeasuredInlineBlock[],
  index: number,
  layout: PaginationLayout
): number {
  const block = blocks[index]
  let totalHeight = estimateBlockHeight(block, layout)

  if (block.kind !== 'title') {
    return totalHeight
  }

  for (let nextIndex = index + 1; nextIndex < blocks.length; nextIndex += 1) {
    const nextBlock = blocks[nextIndex]

    if (nextBlock.kind === 'blank') {
      totalHeight += estimateBlockHeight(nextBlock, layout)
      continue
    }

    if (estimateBlockHeight(nextBlock, layout) > layout.contentHeight) {
      const firstSlice = splitOversizedBlock(
        nextBlock,
        layout,
        Math.max(layout.contentHeight - totalHeight, 0)
      )
      totalHeight += estimateBlockHeight(firstSlice, layout)
      break
    }

    totalHeight += estimateBlockHeight(nextBlock, layout)
    break
  }

  return totalHeight
}

export function estimateBlockHeight(
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

export function splitOversizedBlock(
  block: MeasuredInlineBlock,
  layout: PaginationLayout,
  remainingHeight: number
): MeasuredInlineBlock {
  const charsPerLine = Math.max(8, Math.floor(layout.contentWidth / layout.fontSize))
  const titleBoost = block.kind === 'title' ? 1.35 : 1
  const usableHeight = Math.max(0, remainingHeight - layout.paragraphGap)
  const linesThatFit = Math.max(
    1,
    Math.floor(usableHeight / (layout.fontSize * layout.lineHeight * titleBoost))
  )
  const maxUnits = Math.max(charsPerLine, charsPerLine * linesThatFit)
  let sliceLength = 0
  let sliceUnits = 0

  while (sliceLength < block.text.length) {
    const nextUnits = countVisualUnits(block.text[sliceLength])

    if (sliceLength > 0 && sliceUnits + nextUnits > maxUnits) {
      break
    }

    sliceUnits += nextUnits
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

  for (const [index, block] of blocks.entries()) {
    const blockHeight = estimateBlockHeight(block, input.layout)
    const keepWithNextHeight = estimateKeepWithNextHeight(blocks, index, input.layout)

    if (pageHeight > 0 && block.kind === 'title' && pageHeight + keepWithNextHeight > maxHeight) {
      pushPage()
    }

    if (blockHeight > maxHeight) {
      let remainder = block.text
      let remainderStartOffset = block.startOffset
      let sliceIndex = 0

      while (remainder.length > 0) {
        const availableHeight = pageHeight > 0 ? maxHeight - pageHeight : maxHeight

        if (pageHeight > 0 && availableHeight <= 0) {
          pushPage()
          continue
        }

        const slicedBlock = splitOversizedBlock(
          {
            ...block,
            key: `${block.key}-slice-${sliceIndex}`,
            text: remainder,
            startOffset: remainderStartOffset,
            endOffset: remainderStartOffset + remainder.length,
          },
          input.layout,
          availableHeight
        )

        pageBlocks.push(slicedBlock)
        pageHeight += estimateBlockHeight(slicedBlock, input.layout)
        pushPage()

        remainder = remainder.slice(slicedBlock.text.length)
        remainderStartOffset = slicedBlock.endOffset
        sliceIndex += 1
      }

      continue
    }

    if (pageHeight > 0 && pageHeight + blockHeight > maxHeight) {
      pushPage()
    }

    pageBlocks.push(block)
    pageHeight += blockHeight
  }

  pushPage()
  return pages
}
