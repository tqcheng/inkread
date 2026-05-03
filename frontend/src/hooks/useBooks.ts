import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { booksApi } from '../api/books';
import type { Book, BookDetail, GetBooksParams, UpdateMetadataData } from '../api/types';

export const BOOKS_QUERY_KEY = ['books'];
export const BOOK_QUERY_KEY = 'book';

export function useBooksQuery(params: GetBooksParams = {}) {
  return useQuery({
    queryKey: [...BOOKS_QUERY_KEY, params],
    queryFn: () => booksApi.getBooks(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useBookQuery(id: number) {
  return useQuery({
    queryKey: [BOOK_QUERY_KEY, id],
    queryFn: () => booksApi.getBook(id),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

export const BOOK_CONTENT_QUERY_KEY = 'book-content';

export function useBookContentQuery(id: number, offset: number = 0, limit: number = 50000, chapterIndex?: number, enabled: boolean = true) {
  return useQuery({
    queryKey: [BOOK_CONTENT_QUERY_KEY, id, offset, limit, chapterIndex],
    queryFn: () => booksApi.getBookContent(id, offset, limit, chapterIndex),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
    enabled,
  });
}

export function useToggleFavoriteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isFavorite }: { id: number; isFavorite: boolean }) =>
      booksApi.toggleFavorite(id, isFavorite),
    onMutate: async ({ id, isFavorite }) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: BOOKS_QUERY_KEY });
      await queryClient.cancelQueries({ queryKey: [BOOK_QUERY_KEY, id] });

      // Snapshot the previous value
      const previousBooks = queryClient.getQueriesData({ queryKey: BOOKS_QUERY_KEY });
      const previousBook = queryClient.getQueryData([BOOK_QUERY_KEY, id]);

      // Optimistically update to the new value
      queryClient.setQueriesData({ queryKey: BOOKS_QUERY_KEY }, (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          items: oldData.items.map((book: Book) =>
            book.id === id ? { ...book, is_favorite: isFavorite } : book
          ),
        };
      });

      queryClient.setQueryData([BOOK_QUERY_KEY, id], (oldData: BookDetail | undefined) => {
        if (!oldData) return oldData;
        return { ...oldData, is_favorite: isFavorite };
      });

      // Return a context object with the snapshotted value
      return { previousBooks, previousBook };
    },
    onError: (_err, _variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousBooks) {
        context.previousBooks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      if (context?.previousBook) {
        queryClient.setQueryData([BOOK_QUERY_KEY, _variables.id], context.previousBook);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: BOOKS_QUERY_KEY });
    },
  });
}

export function useUpdateMetadataMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateMetadataData }) =>
      booksApi.updateMetadata(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: BOOKS_QUERY_KEY });
      queryClient.setQueryData([BOOK_QUERY_KEY, data.id], data);
    },
  });
}

export function useBatchDeleteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: number[]) => booksApi.batchDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOOKS_QUERY_KEY });
    },
  });
}
