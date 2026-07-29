// =============================================================================
// Devices Service — API calls for ESP32/ESP8266 device management
// =============================================================================

import api from './api';
import type { ApiResponse, EspDevice, EspDeviceWithKey, DeviceFormData } from '@/types';

export const devicesService = {
  /**
   * GET /api/v1/devices?page=&limit=&search=
   */
  async list(params: { page?: number; limit?: number; search?: string } = {}): Promise<{
    items: EspDevice[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const response = await api.get<ApiResponse<{ items: EspDevice[]; pagination: any }>>('/devices', { params });
    return response.data.data;
  },

  /**
   * GET /api/v1/devices/:id
   */
  async getById(id: number): Promise<EspDevice> {
    const response = await api.get<ApiResponse<EspDevice>>(`/devices/${id}`);
    return response.data.data;
  },

  /**
   * POST /api/v1/devices
   * Returns rawApiKey ONCE — admin must save it!
   */
  async create(data: DeviceFormData): Promise<EspDeviceWithKey> {
    const response = await api.post<ApiResponse<EspDeviceWithKey>>('/devices', data);
    return response.data.data;
  },

  /**
   * PUT /api/v1/devices/:id
   */
  async update(id: number, data: Partial<DeviceFormData>): Promise<EspDevice> {
    const response = await api.put<ApiResponse<EspDevice>>(`/devices/${id}`, data);
    return response.data.data;
  },

  /**
   * PATCH /api/v1/devices/:id/toggle
   */
  async toggle(id: number): Promise<EspDevice> {
    const response = await api.patch<ApiResponse<EspDevice>>(`/devices/${id}/toggle`);
    return response.data.data;
  },

  /**
   * DELETE /api/v1/devices/:id
   */
  async remove(id: number): Promise<void> {
    await api.delete(`/devices/${id}`);
  },
};
