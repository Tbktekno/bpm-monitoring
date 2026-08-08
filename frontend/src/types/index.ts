export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message: string;
  error?: string;
  pagination?: Pagination;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  token: string;
  admin: {
    id: number;
    name: string;
    email: string;
  };
}

export interface Patient {
  id: number;
  patientId: string;
  name: string;
  nik: string | null;
  gender: 'L' | 'P';
  birthDate: string;
  address: string | null;
  phone: string | null;
  bloodType: string | null;
  height: number | null;
  weight: number | null;
  status?: string;
  readings?: Array<{
    status: string;
    bpm: number;
    spo2: number;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface PatientFormData {
  patientId?: string;
  name: string;
  nik: string;
  gender: 'L' | 'P';
  birthDate: string;
  address: string;
  phone: string;
  bloodType: string;
  height: number;
  weight: number;
}

export type PatientStatus = 'Normal' | 'Perlu Pemeriksaan';

export type BackendPatientStatus = 'NORMAL' | 'PERLU_PEMERIKSAAN';

export interface MonitoringReading {
  id: number;
  patientId: number;
  bpm: number;
  spo2: number;
  bpmStatus?: string;
  spo2Status?: string;
  status: string;
  sessionId?: number | null;
  patient?: {
    id: number;
    patientId: string;
    name: string;
    gender?: string;
    age?: number;
  };
  createdAt: string;
}

export interface DashboardStats {
  totalPatients: number;
  statusDistribution: {
    normal: number;
    perluPemeriksaan: number;
    tanpaData: number;
  };
  averages: {
    avgBpm: number;
    avgSpo2: number;
    totalReadings: number;
    range: string;
  };
  last10Readings: MonitoringReading[];
  chartData: Array<{
    hour: string;
    avgBpm: number;
    avgSpo2: number;
    readingCount: number;
  }>;
  timestamp: string;
}

export interface DailyReport {
  date: string;
  totalReadings: number;
  avgBpm: number;
  avgSpo2: number;
  normal: number;
  waspada: number;
  darurat: number;
}

export interface MonthlyReport {
  month: string;
  totalReadings: number;
  avgBpm: number;
  avgSpo2: number;
  normal: number;
  waspada: number;
  darurat: number;
}

export interface AppSettings {
  id: number;
  adminName: string;
  adminEmail: string;
  minBpm: number;
  maxBpm: number;
  minSpo2: number;
  maxSpo2: number;
}

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ThresholdUpdate {
  minBpm: number;
  maxBpm: number;
  minSpo2: number;
  maxSpo2: number;
}

export interface ProfileUpdate {
  name: string;
  email: string;
}

// ─── Device Management ────────────────────────────────────────────────────────
export interface EspDevice {
  id: number;
  deviceId: string;
  label: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EspDeviceWithKey extends EspDevice {
  rawApiKey?: string;
  warning?: string;
}

export interface DeviceFormData {
  deviceId: string;
  label?: string;
  isActive?: boolean;
}
