import { useEffect, useMemo, useState } from 'react'
import {
  getPageLayoutMetrics,
  PAGE_PARAGRAPH_GAP,
} from './layout'
import { findPageForAnchor } from './pagination/findPageForAnchor'
import { measureChapterPages } from './pagination/measureChapterPages'

export function usePageReaderController(params: {
  chapterIndex: number
  chapterText: string
  viewportWidth: number
  viewportHeight: number
  fontSize: number
  lineHeight: number
  initialAnchor: number
}) {
  const [anchorOffset, setAnchorOffset] = useState(params.initialAnchor)

  const layoutMetrics = useMemo(
    () => getPageLayoutMetrics(params.viewportWidth, params.viewportHeight),
    [params.viewportWidth, params.viewportHeight]
  )

  const pages = useMemo(
    () =>
      measureChapterPages({
        chapterIndex: params.chapterIndex,
        text: params.chapterText,
        layout: {
          viewportWidth: params.viewportWidth,
          viewportHeight: params.viewportHeight,
          contentWidth: layoutMetrics.contentWidth,
          contentHeight: layoutMetrics.contentHeight,
          fontSize: params.fontSize,
          lineHeight: params.lineHeight,
          paragraphGap: PAGE_PARAGRAPH_GAP,
        },
      }),
    [
      params.chapterIndex,
      params.chapterText,
      layoutMetrics.contentHeight,
      layoutMetrics.contentWidth,
      params.fontSize,
      params.lineHeight,
      params.viewportHeight,
      params.viewportWidth,
    ]
  )

  useEffect(() => {
    setAnchorOffset(params.initialAnchor)
  }, [params.chapterIndex, params.initialAnchor])

  const currentPageIndex = findPageForAnchor(pages, anchorOffset)
  const currentPage = pages[currentPageIndex] ?? null

  const setCurrentPageIndex = (pageIndex: number) => {
    const nextPage = pages[pageIndex]

    if (!nextPage) {
      return
    }

    setAnchorOffset(nextPage.anchorOffset ?? nextPage.startOffset)
  }

  return {
    pages,
    currentPage,
    currentPageIndex,
    setCurrentPageIndex,
    anchorOffset,
    setAnchorOffset,
  }
}
