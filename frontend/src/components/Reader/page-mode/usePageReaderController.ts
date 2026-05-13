import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
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
  const [pages, setPages] = useState(() =>
    measureChapterPages({
      chapterIndex: params.chapterIndex,
      text: params.chapterText,
      layout: {
        viewportWidth: params.viewportWidth,
        viewportHeight: params.viewportHeight,
        contentWidth: getPageLayoutMetrics(params.viewportWidth, params.viewportHeight)
          .contentWidth,
        contentHeight: getPageLayoutMetrics(
          params.viewportWidth,
          params.viewportHeight
        ).contentHeight,
        fontSize: params.fontSize,
        lineHeight: params.lineHeight,
        paragraphGap: PAGE_PARAGRAPH_GAP,
      },
    })
  )

  const layoutMetrics = useMemo(
    () => getPageLayoutMetrics(params.viewportWidth, params.viewportHeight),
    [params.viewportWidth, params.viewportHeight]
  )

  const paginationLayout = useMemo(
    () => ({
      viewportWidth: params.viewportWidth,
      viewportHeight: params.viewportHeight,
      contentWidth: layoutMetrics.contentWidth,
      contentHeight: layoutMetrics.contentHeight,
      fontSize: params.fontSize,
      lineHeight: params.lineHeight,
      paragraphGap: PAGE_PARAGRAPH_GAP,
    }),
    [
      layoutMetrics.contentHeight,
      layoutMetrics.contentWidth,
      params.fontSize,
      params.lineHeight,
      params.viewportHeight,
      params.viewportWidth,
    ]
  )

  useLayoutEffect(() => {
    setPages(
      measureChapterPages({
        chapterIndex: params.chapterIndex,
        text: params.chapterText,
        layout: paginationLayout,
      })
    )
  }, [params.chapterIndex, params.chapterText, paginationLayout])

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
