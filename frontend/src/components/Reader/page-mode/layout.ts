export const PAGE_TEXT_MAX_WIDTH = 680
export const PAGE_HORIZONTAL_PADDING = 40
export const PAGE_VERTICAL_PADDING = 48
export const PAGE_TOP_CHROME_HEIGHT = 56
export const PAGE_BOTTOM_CHROME_HEIGHT = 64
export const PAGE_PARAGRAPH_GAP = 18
export const PAGE_STAGE_MIN_CONTENT_HEIGHT = 320
export const PAGE_TITLE_FONT_SCALE = 1.42
export const PAGE_STAGE_MAX_WIDTH =
  PAGE_TEXT_MAX_WIDTH + PAGE_HORIZONTAL_PADDING * 2

export function getPageLayoutMetrics(
  viewportWidth: number,
  viewportHeight: number
) {
  const stageWidth = Math.min(Math.max(viewportWidth, 0), PAGE_STAGE_MAX_WIDTH)
  const contentWidth = Math.max(0, stageWidth - PAGE_HORIZONTAL_PADDING * 2)
  const contentHeight = Math.max(
    PAGE_STAGE_MIN_CONTENT_HEIGHT,
    viewportHeight -
      PAGE_TOP_CHROME_HEIGHT -
      PAGE_BOTTOM_CHROME_HEIGHT -
      PAGE_VERTICAL_PADDING * 2
  )

  return {
    stageWidth,
    contentWidth,
    contentHeight,
  }
}
