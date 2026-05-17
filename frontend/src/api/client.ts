import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from './types';
import { useAdminStore } from '../hooks/useAdmin';

const isDevelopment = import.meta.env.MODE === 'development';

const apiClient = axios.create({
  baseURL: isDevelopment ? 'http://localhost:32206/api/v1' : '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 只对 books 列表和 scan 端点添加尾部斜杠，避免 307 重定向
    // 不修改带 query string 的 URL
    if (config.url && !config.url.endsWith('/') && !config.url.includes('?')) {
      if (config.url === '/books' || config.url === '/books/' || 
          config.url === '/scan' || config.url === '/scan/') {
        config.url = config.url + '/';
      }
    }
    
    if (config.url?.startsWith('/admin')) {
      const adminKey = useAdminStore.getState().adminKey;
      const hasExplicitAdminKey =
        config.headers.has('X-Admin-Key') || config.headers.has('x-admin-key');

      if (adminKey && !hasExplicitAdminKey) {
        config.headers.set('X-Admin-Key', adminKey);
      }
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    const apiError: ApiError = error.response?.data || {
      error: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred',
      details: null,
    };
    return Promise.reject(apiError);
  }
);

export default apiClient;
