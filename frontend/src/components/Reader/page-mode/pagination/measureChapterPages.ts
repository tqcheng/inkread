import { createDomBlockMeasurer } from './createDomBlockMeasurer'
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

interface BlockHeightMeasurer {
  measure: (blocks: MeasuredInlineBlock[]) => number
  dispose?: () => void
}

export interface MeasureChapterPagesInput {
  chapterIndex: number
  text: string
  layout: PaginationLayout
  measurer?: BlockHeightMeasurer
}

function countVisualUnits(text: string): number {
  let units = 0

  for (const char of text) {
    units += char.charCodeAt(0) > 255 ? 2 : 1
  }

  return units
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
  const titleBoost = block.kind === 'title' ? 1.42 : 1

  return visualLines * layout.fontSize * layout.lineHeight * titleBoost + layout.paragraphGap
}

function createFallbackMeasurer(layout: PaginationLayout): BlockHeightMeasurer {
  return {
    measure(blocks) {
      return blocks.reduce(
        (height, block) => height + estimateBlockHeight(block, layout),
        0
      )
    },
  }
}

function createBlockMeasurer(
  input: MeasureChapterPagesInput
): BlockHeightMeasurer {
  return (
    input.measurer ??
    createDomBlockMeasurer(input.layout) ??
    createFallbackMeasurer(input.layout)
  )
}

function cloneBlockWithText(
  block: MeasuredInlineBlock,
  text: string,
  startOffset: number,
  endOffset: number,
  suffix = ''
): MeasuredInlineBlock {
  return {
    ...block,
    key: suffix ? `${block.key}-${suffix}` : block.key,
    text,
    startOffset,
    endOffset,
  }
}

function splitBlockAtLength(
  block: MeasuredInlineBlock,
  sliceLength: number,
  sliceIndex: number
): {
  slice: MeasuredInlineBlock
  remainder: MeasuredInlineBlock | null
} {
  const safeLength = Math.max(0, Math.min(sliceLength, block.text.length))
  const sliceText = block.text.slice(0, safeLength)
  const consumedWholeBlock = safeLength === block.text.length
  const sliceEndOffset = consumedWholeBlock
    ? block.endOffset
    : block.startOffset + safeLength

  const slice = cloneBlockWithText(
    block,
    sliceText,
    block.startOffset,
    sliceEndOffset,
    `slice-${sliceIndex}`
  )

  if (consumedWholeBlock) {
    return {
      slice,
      remainder: null,
    }
  }

  return {
    slice,
    remainder: cloneBlockWithText(
      block,
      block.text.slice(safeLength),
      block.startOffset + safeLength,
      block.endOffset,
      `remainder-${sliceIndex}`
    ),
  }
}

function findNaturalBreak(text: string, candidateLength: number): number {
  if (candidateLength >= text.length) {
    return candidateLength
  }

  const minimumLength = Math.max(1, Math.floor(candidateLength * 0.82))
  const softBreakPatterns = [
    /[。！？!?]/,
    /[，、；;：:,.]/,
    /\s/,
  ]

  for (let index = candidateLength; index >= minimumLength; index -= 1) {
    const char = text[index - 1]

    if (softBreakPatterns.some((pattern) => pattern.test(char))) {
      return index
    }
  }

  return candidateLength
}

function findLargestFittingSliceLength(
  pageBlocks: MeasuredInlineBlock[],
  block: MeasuredInlineBlock,
  maxHeight: number,
  measurer: BlockHeightMeasurer
): number {
  let low = 1
  let high = block.text.length
  let best = 0

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const { slice } = splitBlockAtLength(block, middle, 0)
    const height = measurer.measure([...pageBlocks, slice])

    if (height <= maxHeight) {
      best = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  if (best <= 0) {
    return 0
  }

  return findNaturalBreak(block.text, best)
}

function getKeepWithNextBlocks(
  blocks: MeasuredInlineBlock[],
  startIndex: number
): MeasuredInlineBlock[] {
  const keepBlocks: MeasuredInlineBlock[] = []

  for (let index = startIndex; index < blocks.length; index += 1) {
    const nextBlock = blocks[index]

    if (!nextBlock) {
      break
    }

    keepBlocks.push(nextBlock)

    if (nextBlock.kind !== 'blank') {
      break
    }
  }

  return keepBlocks
}

function canKeepTitleWithNext(
  pageBlocks: MeasuredInlineBlock[],
  titleBlock: MeasuredInlineBlock,
  nextBlocks: MeasuredInlineBlock[],
  maxHeight: number,
  measurer: BlockHeightMeasurer
): boolean {
  if (nextBlocks.length === 0) {
    return measurer.measure([...pageBlocks, titleBlock]) <= maxHeight
  }

  if (measurer.measure([...pageBlocks, titleBlock, ...nextBlocks]) <= maxHeight) {
    return true
  }

  const nextContentBlock = nextBlocks[nextBlocks.length - 1]

  if (nextContentBlock?.kind !== 'paragraph') {
    return false
  }

  const previewLength = findLargestFittingSliceLength(
    [...pageBlocks, titleBlock, ...nextBlocks.slice(0, -1)],
    nextContentBlock,
    maxHeight,
    measurer
  )

  return previewLength > 0
}

export function measureChapterPages(input: MeasureChapterPagesInput): MeasuredPage[] {
  const blocks = tokenizeChapter(input.text)
  const firstContentIndex = blocks.findIndex((block) => block.kind !== 'blank')
  const visibleBlocks =
    firstContentIndex > 0 ? blocks.slice(firstContentIndex) : blocks
  const pages: MeasuredPage[] = []
  const maxHeight = input.layout.contentHeight
  const measurer = createBlockMeasurer(input)
  let pageBlocks: MeasuredInlineBlock[] = []

  const pushPage = () => {
    if (pageBlocks.length === 0) {
      return
    }

    pages.push({
      chapterIndex: input.chapterIndex,
      pageInChapter: pages.length,
      startOffset: pageBlocks[0].startOffset,
      endOffset: pageBlocks[pageBlocks.length - 1].endOffset,
      anchorOffset: pageBlocks[0].startOffset,
      blocks: pageBlocks,
    })

    pageBlocks = []
  }

  try {
    for (let blockIndex = 0; blockIndex < visibleBlocks.length; blockIndex += 1) {
      let currentBlock: MeasuredInlineBlock | null = visibleBlocks[blockIndex]
      let sliceIndex = 0

      while (currentBlock) {
        if (currentBlock.kind === 'title' && pageBlocks.length > 0) {
          const nextBlocks = getKeepWithNextBlocks(visibleBlocks, blockIndex + 1)

          if (
            !canKeepTitleWithNext(
              pageBlocks,
              currentBlock,
              nextBlocks,
              maxHeight,
              measurer
            )
          ) {
            pushPage()
            continue
          }
        }

        if (measurer.measure([...pageBlocks, currentBlock]) <= maxHeight) {
          pageBlocks.push(currentBlock)
          currentBlock = null
          continue
        }

        if (currentBlock.kind !== 'paragraph') {
          if (pageBlocks.length > 0) {
            pushPage()
            continue
          }

          pageBlocks.push(currentBlock)
          pushPage()
          currentBlock = null
          continue
        }

        const sliceLength = findLargestFittingSliceLength(
          pageBlocks,
          currentBlock,
          maxHeight,
          measurer
        )

        if (sliceLength <= 0) {
          if (pageBlocks.length > 0) {
            pushPage()
            continue
          }

          const emergencyLength = Math.max(1, Math.min(1, currentBlock.text.length))
          const { slice, remainder } = splitBlockAtLength(
            currentBlock,
            emergencyLength,
            sliceIndex
          )
          pageBlocks.push(slice)
          pushPage()
          currentBlock = remainder
          sliceIndex += 1
          continue
        }

        const { slice, remainder } = splitBlockAtLength(
          currentBlock,
          sliceLength,
          sliceIndex
        )
        pageBlocks.push(slice)
        pushPage()
        currentBlock = remainder
        sliceIndex += 1
      }
    }

    pushPage()
    return pages
  } finally {
    measurer.dispose?.()
  }
}
