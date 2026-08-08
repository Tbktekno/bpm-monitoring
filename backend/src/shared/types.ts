// =============================================================================
// Shared Types — BPM & SpO₂ Monitoring Dashboard
// =============================================================================

// ─── Status constants ────────────────────────────────────────────────────────
export const BPM_STATUS = {
  BRADICARDIA: 'BRADICARDIA',
  NORMAL: 'NORMAL',
  TACHY_RINGAN: 'TACHY_RINGAN',
  TACHY_BERAT: 'TACHY_BERAT',
} as const;
export type BpmStatus = (typeof BPM_STATUS)[keyof typeof BPM_STATUS];

export const SPO2_STATUS = {
  NORMAL: 'NORMAL',
  HIPOKSEMIA_RINGAN: 'HIPOKSEMIA_RINGAN',
  HIPOKSEMIA_SEDANG: 'HIPOKSEMIA_SEDANG',
  HIPOKSEMIA_BERAT: 'HIPOKSEMIA_BERAT',
} as const;
export type Spo2Status = (typeof SPO2_STATUS)[keyof typeof SPO2_STATUS];

export const COMPOSITE_STATUS = {
  NORMAL: 'NORMAL',
  PERLU_PEMERIKSAAN: 'PERLU_PEMERIKSAAN',
} as const;
export type CompositeStatus = (typeof COMPOSITE_STATUS)[keyof typeof COMPOSITE_STATUS];

// ─── Session status ──────────────────────────────────────────────────────────
export const SESSION_STATUS = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

// ─── Audit action ────────────────────────────────────────────────────────────
export const AUDIT_ACTION = {
  VIEW: 'VIEW',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
} as const;
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

// ─── Gender ──────────────────────────────────────────────────────────────────
export const GENDER = {
  L: 'L',
  P: 'P',
} as const;
export type Gender = (typeof GENDER)[keyof typeof GENDER];

// ─── Blood type ──────────────────────────────────────────────────────────────
export const BLOOD_TYPE = {
  A: 'A',
  B: 'B',
  AB: 'AB',
  O: 'O',
} as const;
export type BloodType = (typeof BLOOD_TYPE)[keyof typeof BLOOD_TYPE];

// ─── Vital-signs input payload ───────────────────────────────────────────────
export interface VitalSignsInput {
  bpm: number;
  spo2: number;
  patientId: number;
  sessionId?: number;
}

// ─── Vital-signs with computed statuses ──────────────────────────────────────
export interface VitalSignsResult {
  bpm: number;
  spo2: number;
  bpmStatus: BpmStatus;
  spo2Status: Spo2Status;
  status: CompositeStatus;
}

// ─── Pagination ──────────────────────────────────────────────────────────────
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
