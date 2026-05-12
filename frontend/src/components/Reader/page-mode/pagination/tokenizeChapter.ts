import type { MeasuredInlineBlock } from './types'

export const TITLE_PATTERNS = [
  /^\s*第[一二三四五六七八九十百千0-9]+章.*$/,
  /^\s*chapter\s+\d+.*$/i,
]

export function isChapterTitle(text: string): boolean {
  return TITLE_PATTERNS.some((pattern) => pattern.test(text))
}

export function tokenizeChapter(text: string): MeasuredInlineBlock[] {
  const lines = text.split('\n')
  const blocks: MeasuredInlineBlock[] = []
  let offset = 0

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    const kind: MeasuredInlineBlock['kind'] =
      trimmed.length === 0 ? 'blank' : isChapterTitle(trimmed) ? 'title' : 'paragraph'
    const hasTrailingNewline = index < lines.length - 1
    const blockLength = line.length + (hasTrailingNewline ? 1 : 0)

    blocks.push({
      key: `${kind}-${offset}`,
      text: line,
      kind,
      startOffset: offset,
      endOffset: offset + blockLength,
    })

    offset += blockLength
  }

  return blocks
}
