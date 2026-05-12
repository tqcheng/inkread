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
  it('returns the page containing the anchor offset', () => {
    expect(findPageForAnchor(pages, 130)).toBe(1)
  })

  it('clamps to the nearest page when the anchor is outside the range', () => {
    expect(findPageForAnchor(pages, 999)).toBe(2)
  })
})
