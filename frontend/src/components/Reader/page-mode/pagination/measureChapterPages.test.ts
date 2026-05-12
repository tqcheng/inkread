import { describe, expect, it } from 'vitest'
import { measureChapterPages } from './measureChapterPages'

describe('measureChapterPages', () => {
  it('keeps a title block off a nearly full page', () => {
    const pages = measureChapterPages({
      chapterIndex: 0,
      text: '第一章 开始\n\n' + '正文'.repeat(220),
      layout: {
        viewportWidth: 920,
        viewportHeight: 760,
        contentWidth: 720,
        contentHeight: 560,
        fontSize: 18,
        lineHeight: 1.7,
        paragraphGap: 16,
      },
    })

    expect(pages.length).toBeGreaterThan(1)
    expect(pages[0].blocks.at(-1)?.kind).not.toBe('title')
  })

  it('splits an oversized paragraph into multiple pages', () => {
    const pages = measureChapterPages({
      chapterIndex: 1,
      text: '长段'.repeat(4000),
      layout: {
        viewportWidth: 920,
        viewportHeight: 760,
        contentWidth: 720,
        contentHeight: 560,
        fontSize: 18,
        lineHeight: 1.7,
        paragraphGap: 16,
      },
    })

    expect(pages.length).toBeGreaterThan(1)
    expect(pages[0].endOffset).toBeLessThan(pages.at(-1)!.endOffset)
  })
})
