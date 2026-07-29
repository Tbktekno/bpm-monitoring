import api from './api';
import type { ApiResponse, DailyReport, MonthlyReport } from '@/types';
import { API_BASE_URL } from '@/constants';

export interface ReportParams {
  date?: string;
  month?: string;
  startDate?: string;
  endDate?: string;
}

// Backend returns nested data structure: { daily: [...], monthly: [...], summary: {...} }
interface BackendDailyResponse {
  daily: Array<{
    date: string;
    totalReadings: number;
    normalCount: number;
    waspadaCount: number;
    daruratCount: number;
    avgBpm: number;
    avgSpo2: number;
  }>;
}
interface BackendMonthlyResponse {
  monthly: Array<{
    month: number;
    year: number;
    totalReadings: number;
    normalCount: number;
    waspadaCount: number;
    daruratCount: number;
    avgBpm: number;
    avgSpo2: number;
  }>;
}

export const reportsService = {
  async getDaily(params: ReportParams): Promise<DailyReport[]> {
    // Convert frontend { date } to backend { startDate, endDate }
    const backendParams: Record<string, string> = {};
    if (params.date) {
      backendParams.startDate = params.date;
      backendParams.endDate = params.date;
    }
    const response = await api.get<ApiResponse<BackendDailyResponse>>('/reports/daily', { params: backendParams });
    const daily = response.data.data.daily || [];
    return daily.map((d) => ({
      date: d.date,
      totalReadings: d.totalReadings,
      avgBpm: d.avgBpm,
      avgSpo2: d.avgSpo2,
      normal: d.normalCount,
      waspada: d.waspadaCount,
      darurat: d.daruratCount,
    }));
  },

  async exportSessionPdf(sessionId: number): Promise<Blob> {
    const response = await api.get('/reports/export/session-pdf', {
      params: { sessionId },
      responseType: 'blob',
    });
    return response.data;
  },

  async getMonthly(params: ReportParams): Promise<MonthlyReport[]> {
    // Convert frontend { month: 'YYYY-MM' } to backend { year }
    const backendParams: Record<string, string> = {};
    if (params.month) {
      backendParams.year = params.month.split('-')[0];
    }
    const response = await api.get<ApiResponse<BackendMonthlyResponse>>('/reports/monthly', { params: backendParams });
    const monthly = response.data.data.monthly || [];
    return monthly.map((m) => ({
      month: `${m.year}-${String(m.month).padStart(2, '0')}`,
      totalReadings: m.totalReadings,
      avgBpm: m.avgBpm,
      avgSpo2: m.avgSpo2,
      normal: m.normalCount,
      waspada: m.waspadaCount,
      darurat: m.daruratCount,
    }));
  },

  async exportPdf(params: ReportParams & { type: 'harian' | 'bulanan' }): Promise<Blob> {
    // Convert frontend params to backend format
    const backendParams: Record<string, string> = {
      type: params.type === 'harian' ? 'daily' : 'monthly',
    };
    if (params.date) {
      backendParams.startDate = params.date;
      backendParams.endDate = params.date;
    } else if (params.month) {
      const [year, month] = params.month.split('-');
      // First day of month
      backendParams.startDate = `${params.month}-01`;
      // Last day of month
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      backendParams.endDate = `${params.month}-${String(lastDay).padStart(2, '0')}`;
    }
    const response = await api.get('/reports/export/pdf', {
      params: backendParams,
      responseType: 'blob',
    });
    return response.data;
  },

  async exportExcel(params: ReportParams & { type: 'harian' | 'bulanan' }): Promise<Blob> {
    // Convert frontend params to backend format
    const backendParams: Record<string, string> = {};
    if (params.date) {
      backendParams.startDate = params.date;
      backendParams.endDate = params.date;
    } else if (params.month) {
      const [year, month] = params.month.split('-');
      backendParams.startDate = `${params.month}-01`;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      backendParams.endDate = `${params.month}-${String(lastDay).padStart(2, '0')}`;
    }
    const response = await api.get('/reports/export/excel', {
      params: backendParams,
      responseType: 'blob',
    });
    return response.data;
  },

  downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};
