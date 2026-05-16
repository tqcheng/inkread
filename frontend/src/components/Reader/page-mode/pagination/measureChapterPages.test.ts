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

  it('keeps a title with its spacer line and following paragraph', () => {
    const pages = measureChapterPages({
      chapterIndex: 9,
      text: 'a'.repeat(15) + '\nChapter 2\n\nb',
      layout: {
        viewportWidth: 920,
        viewportHeight: 760,
        contentWidth: 180,
        contentHeight: 160,
        fontSize: 18,
        lineHeight: 1.7,
        paragraphGap: 16,
      },
    })

    const titlePage = pages.find((page) => page.blocks.some((block) => block.kind === 'title'))

    expect(titlePage).toBeDefined()
    expect(titlePage?.blocks.map((block) => block.kind)).toEqual(
      expect.arrayContaining(['title', 'blank', 'paragraph'])
    )
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

  it('fills remaining page space by slicing a paragraph that would otherwise leave a large gap', () => {
    const pages = measureChapterPages({
      chapterIndex: 7,
      text: `${'a'.repeat(30)}\n${'b'.repeat(40)}`,
      layout: {
        viewportWidth: 400,
        viewportHeight: 300,
        contentWidth: 100,
        contentHeight: 50,
        fontSize: 10,
        lineHeight: 1,
        paragraphGap: 0,
      },
    })

    expect(pages).toHaveLength(2)
    expect(pages[0]?.blocks).toHaveLength(2)
    expect(pages[0]?.blocks[1]?.text.length).toBeGreaterThan(0)
    expect(pages[0]?.blocks[1]?.text.length).toBeLessThan(40)
  })

  it('keeps paragraph slices continuous when a normal paragraph is split across pages', () => {
    const secondParagraph = 'b'.repeat(40)
    const pages = measureChapterPages({
      chapterIndex: 8,
      text: `${'a'.repeat(30)}\n${secondParagraph}`,
      layout: {
        viewportWidth: 400,
        viewportHeight: 300,
        contentWidth: 100,
        contentHeight: 50,
        fontSize: 10,
        lineHeight: 1,
        paragraphGap: 0,
      },
    })

    const combinedSecondParagraph = pages
      .flatMap((page) => page.blocks)
      .filter((block) => block.text.includes('b'))
      .map((block) => block.text)
      .join('')

    expect(combinedSecondParagraph).toBe(secondParagraph)
  })

  it('does not emit a blank first page when chapter text starts with many empty lines', () => {
    const pages = measureChapterPages({
      chapterIndex: 10,
      text: `${'\n'.repeat(24)}第一章 十景锻\n\n正文开场 ${'内容'.repeat(80)}`,
      layout: {
        viewportWidth: 420,
        viewportHeight: 260,
        contentWidth: 220,
        contentHeight: 90,
        fontSize: 18,
        lineHeight: 1.7,
        paragraphGap: 16,
      },
    })

    expect(pages.length).toBeGreaterThan(0)
    expect(pages[0]?.blocks.some((block) => block.kind !== 'blank')).toBe(true)
  })
})
