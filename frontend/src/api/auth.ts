import apiClient from './client';
import type { AuthStatus, AuthLoginResponse } from './types';

export const authApi = {
  getStatus: async (): Promise<AuthStatus> => {
    const response = await apiClient.get<AuthStatus>('/auth/status');
    return response.data;
  },

  login: async (password: string): Promise<AuthLoginResponse> => {
    const response = await apiClient.post<AuthLoginResponse>('/auth/login', {
      password,
    });
    return response.data;
  },
};
