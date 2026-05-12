import { useQueries } from '@tanstack/react-query'
import { booksApi } from '../api/books'
import type { Chapter } from '../api/types'

export function usePageChapterContent(
  bookId: number,
  chapters: Chapter[],
  chapterIndex: number
) {
  const activeIndexes = [chapterIndex - 1, chapterIndex, chapterIndex + 1].filter(
    (index) => index >= 0 && index < chapters.length
  )

  const results = useQueries({
    queries: activeIndexes.map((index) => ({
      queryKey: ['pageChapterContent', bookId, index],
      queryFn: () => booksApi.getBookContent(bookId, 0, 200000, index),
      staleTime: 5 * 60 * 1000,
    })),
  })

  return activeIndexes.reduce<Record<number, string>>((acc, index, resultIndex) => {
    acc[index] = results[resultIndex].data?.content ?? ''
    return acc
  }, {})
}
