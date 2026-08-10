import api from './api';
import type { ApiResponse, MonitoringReading, Pagination } from '@/types';

export interface MonitoringParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  patientId?: string;
}

export interface MonitoringListResponse {
  readings: MonitoringReading[];
  pagination: Pagination;
}

export interface SessionData {
  id: number;
  patientId: number;
  deviceId: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  startTime: string;
  endTime: string | null;
  notes: string | null;
  patient?: { id: number; patientId: string; name: string };
  _count?: { readings: number };
}

export const monitoringService = {
  async getRealtime(params?: MonitoringParams): Promise<MonitoringListResponse> {
    const response = await api.get<ApiResponse<MonitoringListResponse>>('/monitoring/realtime', { params });
    return response.data.data;
  },

  async getByPatient(patientId: string, params?: { page?: number; limit?: number }): Promise<MonitoringListResponse> {
    const response = await api.get<ApiResponse<MonitoringListResponse>>(`/monitoring/patient/${patientId}`, { params });
    return response.data.data;
  },

  /** Memulai sesi monitoring baru untuk responden + device */
  async startSession(patientId: number, deviceId?: string): Promise<SessionData> {
    const response = await api.post<ApiResponse<SessionData>>('/monitoring/session/start', { patientId, deviceId });
    return response.data.data;
  },

  /** Mengakhiri sesi monitoring */
  async stopSession(sessionId: number): Promise<SessionData> {
    const response = await api.post<ApiResponse<SessionData>>('/monitoring/session/stop', { sessionId });
    return response.data.data;
  },

  /** Mendapatkan detail sesi + readings */
  async getSessionDetail(sessionId: number): Promise<{ session: SessionData; readings: any[]; totalReadings: number }> {
    const response = await api.get<ApiResponse<{ session: SessionData; readings: any[]; totalReadings: number }>>(`/monitoring/session/${sessionId}`);
    return response.data.data;
  },

  /** Mendapatkan daftar sesi monitoring */
  async getSessions(params?: { page?: number; limit?: number; patientId?: number; status?: string }): Promise<{ items: SessionData[]; pagination: any }> {
    const response = await api.get<ApiResponse<{ items: SessionData[]; pagination: any }>>('/monitoring/sessions', { params });
    return response.data.data;
  },
};
