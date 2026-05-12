export interface MeasuredInlineBlock {
  key: string
  text: string
  kind: 'title' | 'paragraph' | 'blank'
  startOffset: number
  endOffset: number
}

export interface MeasuredPage {
  chapterIndex: number
  pageInChapter: number
  startOffset: number
  endOffset: number
  anchorOffset: number
  blocks: MeasuredInlineBlock[]
}
