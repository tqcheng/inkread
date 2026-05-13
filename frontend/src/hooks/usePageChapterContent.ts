import { useQueries } from '@tanstack/react-query'
import { booksApi } from '../api/books'
import type { Chapter } from '../api/types'

interface PageChapterContentState {
  contentByIndex: Record<number, string>
  errorsByIndex: Record<number, string | null>
}

export function usePageChapterContent(
  bookId: number,
  chapters: Chapter[],
  chapterIndex: number
): PageChapterContentState {
  const activeIndexes = [chapterIndex - 1, chapterIndex, chapterIndex + 1].filter(
    (index) => index >= 0 && index < chapters.length
  )

  const results = useQueries({
    queries: activeIndexes.map((index) => ({
      queryKey: ['pageChapterContent', bookId, index, chapters[index]?.chapter_index],
      queryFn: async () => {
        const chapter = chapters[index]

        if (!chapter) {
          return ''
        }

        if (chapter.chapter_index === null) {
          throw new Error(`Chapter at array index ${index} is missing chapter_index metadata`)
        }

        const response = await booksApi.getBookContent(bookId, 0, 10000, chapter.chapter_index)
        return response.content
      },
      staleTime: 5 * 60 * 1000,
    })),
  })

  return activeIndexes.reduce<PageChapterContentState>(
    (acc, index, resultIndex) => {
      acc.contentByIndex[index] = results[resultIndex].data ?? ''
      acc.errorsByIndex[index] =
        results[resultIndex].error instanceof Error ? results[resultIndex].error.message : null
      return acc
    },
    {
      contentByIndex: {},
      errorsByIndex: {},
    }
  )
}
