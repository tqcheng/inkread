import { describe, expect, it } from 'vitest'
import { estimateBlockHeight, measureChapterPages } from './measureChapterPages'

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
    expect(pages[0].blocks[pages[0].blocks.length - 1]?.kind).not.toBe('title')
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
    expect(pages[0].endOffset).toBeLessThan(pages[pages.length - 1]!.endOffset)
  })

  it('keeps a title with the following content instead of orphaning it', () => {
    const pages = measureChapterPages({
      chapterIndex: 2,
      text: 'a'.repeat(15) + '\nChapter 2\nb',
      layout: {
        viewportWidth: 920,
        viewportHeight: 760,
        contentWidth: 180,
        contentHeight: 140,
        fontSize: 18,
        lineHeight: 1.7,
        paragraphGap: 16,
      },
    })

    const titlePage = pages.find((page) => page.blocks.some((block) => block.kind === 'title'))

    expect(titlePage).toBeDefined()
    expect(titlePage?.blocks[titlePage.blocks.length - 1]?.kind).not.toBe('title')
    expect(titlePage?.blocks.some((block) => block.kind === 'paragraph')).toBe(true)
  })

  it('keeps oversized paragraph slices within the page height budget', () => {
    const layout = {
      viewportWidth: 920,
      viewportHeight: 760,
      contentWidth: 720,
      contentHeight: 560,
      fontSize: 18,
      lineHeight: 1.7,
      paragraphGap: 16,
    }
    const pages = measureChapterPages({
      chapterIndex: 3,
      text: '长段'.repeat(4000),
      layout,
    })

    expect(pages.length).toBeGreaterThan(1)
    expect(
      pages.every(
        (page) =>
          page.blocks.reduce(
            (height, block) => height + estimateBlockHeight(block, layout),
            0
          ) <= layout.contentHeight
      )
    ).toBe(true)
  })

  it('does not let the final page offset exceed the source text length', () => {
    const text = '第一章 开始\n正文'
    const pages = measureChapterPages({
      chapterIndex: 4,
      text,
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

    expect(pages[pages.length - 1]?.endOffset).toBe(text.length)
    expect(pages[pages.length - 1]?.endOffset).toBeLessThanOrEqual(text.length)
  })

  it('keeps a title with the first slice of an oversized following paragraph', () => {
    const pages = measureChapterPages({
      chapterIndex: 5,
      text: 'a'.repeat(15) + '\nChapter 2\n' + '长段'.repeat(4000),
      layout: {
        viewportWidth: 920,
        viewportHeight: 760,
        contentWidth: 180,
        contentHeight: 140,
        fontSize: 18,
        lineHeight: 1.7,
        paragraphGap: 16,
      },
    })

    const titlePage = pages.find((page) => page.blocks.some((block) => block.kind === 'title'))

    expect(titlePage).toBeDefined()
    expect(titlePage?.blocks.some((block) => block.kind === 'paragraph')).toBe(true)
  })

  it('moves an oversized slice to a fresh page when the remaining height is too small', () => {
    const layout = {
      viewportWidth: 920,
      viewportHeight: 760,
      contentWidth: 180,
      contentHeight: 140,
      fontSize: 18,
      lineHeight: 1.7,
      paragraphGap: 16,
    }
    const pages = measureChapterPages({
      chapterIndex: 6,
      text: 'a'.repeat(15) + '\n\n' + '长段'.repeat(4000),
      layout,
    })

    expect(pages.length).toBeGreaterThan(1)
    expect(
      pages.every(
        (page) =>
          page.blocks.reduce(
            (height, block) => height + estimateBlockHeight(block, layout),
            0
          ) <= layout.contentHeight
      )
    ).toBe(true)
  })
})
