import axios from 'axios';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/constants';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;

      if (status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        toast.error('Sesi telah berakhir. Silakan login kembali.');
      } else if (status === 403) {
        toast.error('Akses ditolak.');
      } else if (status === 404) {
        toast.error(data?.message || 'Data tidak ditemukan.');
      } else if (status === 422) {
        toast.error(data?.message || 'Validasi gagal.');
      } else if (status >= 500) {
        toast.error('Terjadi kesalahan server. Silakan coba lagi.');
      }
    } else if (error.code === 'ERR_NETWORK') {
      toast.error('Tidak dapat terhubung ke server. Periksa koneksi Anda.');
    } else if (error.code === 'ECONNABORTED') {
      toast.error('Waktu permintaan habis. Silakan coba lagi.');
    }

    return Promise.reject(error);
  }
);

export default api;
