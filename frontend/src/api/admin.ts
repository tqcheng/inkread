import apiClient from './client';
import type {
  Book,
  DedupGroupListResponse,
  DedupResolveRequest,
  DedupResolveResponse,
  DedupSummaryResponse,
  SecuritySettingsRequest,
  SecuritySettingsResponse,
  UpdateMetadataData,
} from './types';

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

  validateKey: async (adminKey?: string): Promise<boolean> => {
    try {
      await apiClient.get('/admin/validate', {
        headers: adminKey ? { 'X-Admin-Key': adminKey } : undefined,
      });
      return true;
    } catch {
      return false;
    }
  },

  getDedupSummary: async (): Promise<DedupSummaryResponse> => {
    const response = await apiClient.get<DedupSummaryResponse>('/admin/dedup/summary');
    return response.data;
  },

  getDedupGroups: async (): Promise<DedupGroupListResponse> => {
    const response = await apiClient.get<DedupGroupListResponse>('/admin/dedup/groups');
    return response.data;
  },

  resolveDedupGroup: async (data: DedupResolveRequest): Promise<DedupResolveResponse> => {
    const response = await apiClient.post<DedupResolveResponse>('/admin/dedup/resolve', data);
    return response.data;
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

  updateSecuritySettings: async (data: SecuritySettingsRequest): Promise<SecuritySettingsResponse> => {
    const response = await apiClient.post<SecuritySettingsResponse>('/admin/settings/security', data);
    return response.data;
  },
};

export default adminApi;
