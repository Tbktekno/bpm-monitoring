import api from './api';
import type { ApiResponse, DashboardStats } from '@/types';

export const dashboardService = {
  async getStats(): Promise<DashboardStats> {
    const response = await api.get<ApiResponse<DashboardStats>>('/dashboard');
    return response.data.data;
  },
};
