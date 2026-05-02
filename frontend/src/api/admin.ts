import apiClient from './client';
import type { Book, UpdateMetadataData } from './types';

export const adminApi = {
  batchDelete: async (ids: number[]): Promise<void> => {
    await apiClient.post('/admin/batch-delete', {
      ids,
      permanent: false,
    });
  },

  updateMetadata: async (id: number, data: UpdateMetadataData): Promise<Book> => {
    const response = await apiClient.put<Book>(`/admin/metadata/${id}`, {
      ...data,
      tags_source: 'manual',
    });
    return response.data;
  },

  validateKey: async (): Promise<boolean> => {
    try {
      await apiClient.get('/admin/validate');
      return true;
    } catch {
      return false;
    }
  },

  getOrphanedBooksCount: async (): Promise<{ orphaned_books: number }> => {
    const response = await apiClient.get<{ orphaned_books: number }>('/admin/cleanup/count');
    return response.data;
  },

  cleanupOrphanedBooks: async (): Promise<{ deleted: number }> => {
    const response = await apiClient.post<{ deleted: number }>('/admin/cleanup');
    return response.data;
  },

  resetDatabase: async (): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string }>('/admin/reset');
    return response.data;
  },
};

export default adminApi;
