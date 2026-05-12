import { useEffect, useMemo, useState } from 'react'
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

  const pages = useMemo(
    () =>
      measureChapterPages({
        chapterIndex: params.chapterIndex,
        text: params.chapterText,
        layout: {
          viewportWidth: params.viewportWidth,
          viewportHeight: params.viewportHeight,
          contentWidth: Math.min(720, params.viewportWidth - 96),
          contentHeight: Math.max(320, params.viewportHeight - 160),
          fontSize: params.fontSize,
          lineHeight: params.lineHeight,
          paragraphGap: 16,
        },
      }),
    [
      params.chapterIndex,
      params.chapterText,
      params.viewportWidth,
      params.viewportHeight,
      params.fontSize,
      params.lineHeight,
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
