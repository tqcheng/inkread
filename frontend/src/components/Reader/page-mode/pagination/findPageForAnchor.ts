import type { MeasuredPage } from './types'

/**
 * Resolves a chapter text offset to the measured page whose [startOffset, endOffset)
 * range contains it. Returns -1 when no pages are available.
 */
export function findPageForAnchor(
  pages: MeasuredPage[],
  anchorOffset: number
): number {
  if (pages.length === 0) return -1

  const pageIndex = pages.findIndex(
    (page) => anchorOffset >= page.startOffset && anchorOffset < page.endOffset
  )

  if (pageIndex >= 0) return pageIndex
  if (anchorOffset < pages[0].startOffset) return 0

  return pages.length - 1
}
