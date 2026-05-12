import apiClient from './client';
import type {
  Book,
  BookListResponse,
  BookDetail,
  GetBooksParams,
  UpdateMetadataData,
  BookContentResponse,
  ScanResponse,
  ScanStatusResponse,
  ScanResultSummary,
  BookSearchResponse,
} from './types';

interface GetBookContentParams {
  offset: number;
  limit: number;
  chapter_index?: number;
}

export const booksApi = {
  getBooks: async (params: GetBooksParams = {}): Promise<BookListResponse> => {
    const response = await apiClient.get<BookListResponse>('/books', { params });
    return response.data;
  },

  getBook: async (id: number): Promise<BookDetail> => {
    const response = await apiClient.get<BookDetail>(`/books/${id}`);
    return response.data;
  },

  getBookContent: async (
    id: number,
    offset: number = 0,
    limit: number = 10000,
    chapterIndex?: number
  ): Promise<BookContentResponse> => {
    const params: GetBookContentParams = {
      offset,
      limit,
    };

    if (chapterIndex !== undefined) {
      params.chapter_index = chapterIndex;
    }

    const response = await apiClient.get<BookContentResponse>(`/books/${id}/content`, {
      params,
    });
    return response.data;
  },

  toggleFavorite: async (id: number, isFavorite: boolean): Promise<{ is_favorite: boolean }> => {
    if (isFavorite) {
      const response = await apiClient.post<{ is_favorite: boolean }>(`/books/${id}/favorite`);
      return response.data;
    } else {
      const response = await apiClient.delete<{ is_favorite: boolean }>(`/books/${id}/favorite`);
      return response.data;
    }
  },

  updateMetadata: async (id: number, data: UpdateMetadataData): Promise<Book> => {
    const response = await apiClient.put<Book>(`/admin/metadata/${id}`, {
      ...data,
      tags_source: 'manual',
    });
    return response.data;
  },

  batchDelete: async (ids: number[], adminKey?: string): Promise<void> => {
    if (adminKey) {
      const response = await apiClient.post('/admin/batch-delete', {
        ids,
        permanent: false,
      }, {
        headers: { 'X-Admin-Key': adminKey },
      });
      return response.data;
    }
    await apiClient.post('/admin/batch-delete', {
      ids,
      permanent: false,
    });
  },

  getUncategorized: async (): Promise<Book[]> => {
    const response = await apiClient.get<Book[]>('/books/uncategorized');
    return response.data;
  },

  updateProgress: async (
    id: number,
    data: {
      position: number;
      chapter?: string;
      settings?: Record<string, any>;
    }
  ): Promise<void> => {
    await apiClient.put(`/chapters/books/${id}/progress`, {
      position: data.position,
      chapter: data.chapter,
      device_id: 'web',
      reading_settings: data.settings,
    });
  },

  reanalyzeBook: async (id: number): Promise<Book> => {
    const response = await apiClient.post<Book>(`/ai/reanalyze/${id}`);
    return response.data;
  },

  searchBookContent: async (id: number, query: string): Promise<BookSearchResponse> => {
    const response = await apiClient.get<BookSearchResponse>(`/books/${id}/search`, {
      params: { q: query },
    });
    return response.data;
  },
};

export const scanApi = {
  triggerScan: async (path?: string): Promise<ScanResponse> => {
    const response = await apiClient.post<ScanResponse>('/scan/', {
      library_path: path,
    });
    return response.data;
  },

  getScanStatus: async (taskId: string): Promise<ScanStatusResponse> => {
    const response = await apiClient.get<ScanStatusResponse>(`/scan/${taskId}`);
    return response.data;
  },

  getScanSummary: async (): Promise<ScanResultSummary> => {
    const response = await apiClient.get<ScanResultSummary>('/scan/');
    return response.data;
  },
};

export default booksApi;
