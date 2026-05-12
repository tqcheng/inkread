import { describe, expect, it } from 'vitest'
import { findPageForAnchor } from './findPageForAnchor'
import type { MeasuredPage } from './types'

const pages: MeasuredPage[] = [
  {
    chapterIndex: 2,
    pageInChapter: 0,
    startOffset: 0,
    endOffset: 120,
    anchorOffset: 0,
    blocks: []
  },
  {
    chapterIndex: 2,
    pageInChapter: 1,
    startOffset: 120,
    endOffset: 260,
    anchorOffset: 120,
    blocks: []
  },
  {
    chapterIndex: 2,
    pageInChapter: 2,
    startOffset: 260,
    endOffset: 400,
    anchorOffset: 260,
    blocks: []
  }
]

describe('findPageForAnchor', () => {
  it('returns -1 when no pages are available', () => {
    expect(findPageForAnchor([], 0)).toBe(-1)
  })

  it('returns the page containing the anchor offset', () => {
    expect(findPageForAnchor(pages, 130)).toBe(1)
  })

  it('clamps to the first page when the anchor is below the measured range', () => {
    expect(findPageForAnchor(pages, -5)).toBe(0)
  })

  it('treats exact end offsets as the next page boundary', () => {
    expect(findPageForAnchor(pages, 120)).toBe(1)
    expect(findPageForAnchor(pages, 260)).toBe(2)
  })

  it('clamps to the nearest page when the anchor is outside the range', () => {
    expect(findPageForAnchor(pages, 999)).toBe(2)
  })

  it('picks the page whose range contains the saved anchor after re-pagination', () => {
    const repaginated: MeasuredPage[] = [
      {
        chapterIndex: 3,
        pageInChapter: 0,
        startOffset: 0,
        endOffset: 80,
        anchorOffset: 0,
        blocks: []
      },
      {
        chapterIndex: 3,
        pageInChapter: 1,
        startOffset: 80,
        endOffset: 160,
        anchorOffset: 80,
        blocks: []
      },
      {
        chapterIndex: 3,
        pageInChapter: 2,
        startOffset: 160,
        endOffset: 240,
        anchorOffset: 160,
        blocks: []
      }
    ]

    expect(findPageForAnchor(repaginated, 158)).toBe(1)
  })
})
