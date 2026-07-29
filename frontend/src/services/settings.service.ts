import api from './api';
import type { ApiResponse, AppSettings, PasswordChange, ThresholdUpdate, ProfileUpdate } from '@/types';

export const settingsService = {
  async getSettings(): Promise<AppSettings> {
    const response = await api.get<ApiResponse<AppSettings>>('/settings');
    return response.data.data;
  },

  async updateProfile(data: ProfileUpdate): Promise<AppSettings> {
    const response = await api.put<ApiResponse<AppSettings>>('/settings/profile', data);
    return response.data.data;
  },

  async updateThresholds(data: ThresholdUpdate): Promise<AppSettings> {
    const response = await api.put<ApiResponse<AppSettings>>('/settings/thresholds', data);
    return response.data.data;
  },

  async changePassword(data: PasswordChange): Promise<void> {
    await api.put('/settings/password', data);
  },

  async clearData(): Promise<{ deletedReadings: number; deletedSessions: number; deletedAuditLogs: number; keptDevices: number; keptAdmins: number }> {
    const response = await api.delete<ApiResponse<any>>('/settings/data');
    return response.data.data;
  },
};
