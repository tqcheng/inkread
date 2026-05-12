import { useQueries } from '@tanstack/react-query'
import { booksApi } from '../api/books'
import type { Chapter } from '../api/types'

const MAX_CHUNK_SIZE = 200000

async function fetchChapterContent(bookId: number, chapter: Chapter): Promise<string> {
  const startOffset = chapter.position_start
  const endOffset = chapter.position_end
  let nextOffset: number | null = startOffset
  let content = ''

  while (nextOffset !== null) {
    const remaining = endOffset === null ? MAX_CHUNK_SIZE : endOffset - nextOffset

    if (remaining <= 0) {
      break
    }

    const response = await booksApi.getBookContent(
      bookId,
      nextOffset,
      Math.min(MAX_CHUNK_SIZE, remaining)
    )

    content += response.content

    if (endOffset !== null) {
      if (response.next_offset !== null && response.next_offset >= endOffset) {
        break
      }
    }

    if (response.next_offset === null || response.is_end) {
      break
    }

    nextOffset = response.next_offset
  }

  return content
}

export function usePageChapterContent(
  bookId: number,
  chapters: Chapter[],
  chapterIndex: number
) {
  const activeChapters = [chapterIndex - 1, chapterIndex, chapterIndex + 1]
    .map((index) => chapters[index])
    .filter((chapter): chapter is Chapter => Boolean(chapter) && chapter.chapter_index !== null)

  const results = useQueries({
    queries: activeChapters.map((chapter) => ({
      queryKey: [
        'pageChapterContent',
        bookId,
        chapter.id,
        chapter.chapter_index,
        chapter.position_start,
        chapter.position_end,
      ],
      queryFn: () => fetchChapterContent(bookId, chapter),
      staleTime: 5 * 60 * 1000,
    })),
  })

  return activeChapters.reduce<Record<number, string>>((acc, chapter, resultIndex) => {
    if (chapter.chapter_index === null) {
      return acc
    }

    acc[chapter.chapter_index] = results[resultIndex].data ?? ''
    return acc
  }, {})
}
