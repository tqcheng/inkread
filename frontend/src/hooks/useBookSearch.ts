import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { booksApi } from '../api/books';
import type { BookSearchResponse } from '../api/types';

export function useBookSearch(bookId: number, query: string, enabled: boolean) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    if (!enabled || !query.trim()) {
      setDebouncedQuery('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query, enabled]);

  return useQuery<BookSearchResponse>({
    queryKey: ['bookSearch', bookId, debouncedQuery],
    queryFn: () => booksApi.searchBookContent(bookId, debouncedQuery),
    enabled: enabled && debouncedQuery.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
