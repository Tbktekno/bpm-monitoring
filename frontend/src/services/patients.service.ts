import api from './api';
import type { ApiResponse, Patient, PatientFormData, Pagination } from '@/types';

export interface PatientListParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface PatientListResponse {
  items: Patient[];
  pagination: Pagination;
}

export const patientsService = {
  async getAll(params?: PatientListParams): Promise<PatientListResponse> {
    const response = await api.get<ApiResponse<PatientListResponse>>('/patients', { params });
    return response.data.data;
  },

  async getById(id: string): Promise<Patient> {
    const response = await api.get<ApiResponse<Patient>>(`/patients/${id}`);
    return response.data.data;
  },

  async create(data: PatientFormData): Promise<Patient> {
    const response = await api.post<ApiResponse<Patient>>('/patients', data);
    return response.data.data;
  },

  async update(id: string, data: Partial<PatientFormData>): Promise<Patient> {
    const response = await api.put<ApiResponse<Patient>>(`/patients/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/patients/${id}`);
  },

  async search(query: string): Promise<Patient[]> {
    const response = await api.get<ApiResponse<Patient[]>>('/patients/search', { params: { q: query } });
    return response.data.data;
  },
};
