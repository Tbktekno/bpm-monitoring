export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

export const BPM_THRESHOLDS = {
  min: 60,
  max: 100,
  waspadaLow: 50,
  waspadaHigh: 120,
} as const;

export const SPO2_THRESHOLDS = {
  min: 95,
  max: 100,
  waspada: 90,
} as const;

export const STATUS_COLORS = {
  Normal: {
    bg: 'bg-success-50',
    text: 'text-success-600',
    dot: 'bg-success-500',
    border: 'border-success-500',
  },
  'Dugaan Bradikardia': {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    dot: 'bg-amber-500',
    border: 'border-amber-500',
  },
  'Dugaan Takikardia': {
    bg: 'bg-warning-50',
    text: 'text-warning-600',
    dot: 'bg-warning-500',
    border: 'border-warning-500',
  },
  'Penurunan Saturasi Oksigen': {
    bg: 'bg-warning-50',
    text: 'text-warning-600',
    dot: 'bg-warning-500',
    border: 'border-warning-500',
  },
  'Dugaan Hipoksemia': {
    bg: 'bg-danger-50',
    text: 'text-danger-600',
    dot: 'bg-danger-500',
    border: 'border-danger-500',
  },
  'Perlu Pemeriksaan': {
    bg: 'bg-warning-50',
    text: 'text-warning-600',
    dot: 'bg-warning-500',
    border: 'border-warning-500',
  },
} as const;

/**
 * Classification logic based on BPM & SpO₂ matrix:
 * - SpO₂ < 90% (any BPM): Dugaan Hipoksemia
 * - SpO₂ 90-94% (any BPM): Penurunan Saturasi Oksigen
 * - SpO₂ >= 95% & BPM 60-100: Normal
 * - SpO₂ >= 95% & BPM < 60: Dugaan Bradikardia
 * - SpO₂ >= 95% & BPM > 100: Dugaan Takikardia
 */
export function calculateDiseaseStatus(bpm: number, spo2: number): string {
  if (spo2 < 90) return 'Dugaan Hipoksemia';
  if (spo2 < 95) return 'Penurunan Saturasi Oksigen';
  if (bpm < 60) return 'Dugaan Bradikardia';
  if (bpm > 100) return 'Dugaan Takikardia';
  return 'Normal';
}

export const BLOOD_TYPES = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'AB', label: 'AB' },
  { value: 'O', label: 'O' },
] as const;

export const GENDER_OPTIONS = [
  { value: 'L', label: 'Laki-laki' },
  { value: 'P', label: 'Perempuan' },
] as const;

export const STATUS_FILTERS = [
  { value: '', label: 'Semua Status' },
  { value: 'Normal', label: 'Normal' },
  { value: 'Perlu Pemeriksaan', label: 'Perlu Pemeriksaan' },
  { value: 'Dugaan Bradikardia', label: 'Dugaan Bradikardia' },
  { value: 'Dugaan Takikardia', label: 'Dugaan Takikardia' },
  { value: 'Penurunan Saturasi Oksigen', label: 'Penurunan Saturasi Oksigen' },
  { value: 'Dugaan Hipoksemia', label: 'Dugaan Hipoksemia' },
] as const;

export const ITEMS_PER_PAGE = 10;

export const REPORT_TYPES = [
  { value: 'harian', label: 'Harian' },
  { value: 'bulanan', label: 'Bulanan' },
] as const;
