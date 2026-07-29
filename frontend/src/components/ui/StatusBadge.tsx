import { STATUS_COLORS, calculateDiseaseStatus } from '@/constants';

interface StatusBadgeProps {
  status?: string;
  bpm?: number;
  spo2?: number;
  size?: 'sm' | 'md';
}

/**
 * Normalize status format (backend or legacy) to frontend display format
 */
function normalizeStatus(s?: string): keyof typeof STATUS_COLORS {
  if (!s) return 'Normal';

  const map: Record<string, keyof typeof STATUS_COLORS> = {
    'NORMAL': 'Normal',
    'Normal': 'Normal',
    'DUGAAN_BRADIKARDIA': 'Dugaan Bradikardia',
    'BRADICARDIA': 'Dugaan Bradikardia',
    'BRADIKARDIA': 'Dugaan Bradikardia',
    'Dugaan Bradikardia': 'Dugaan Bradikardia',
    'DUGAAN_TAKIKARDIA': 'Dugaan Takikardia',
    'TAKIKARDIA': 'Dugaan Takikardia',
    'TACHYCARDI': 'Dugaan Takikardia',
    'TACHY_RINGAN': 'Dugaan Takikardia',
    'TACHY_BERAT': 'Dugaan Takikardia',
    'Dugaan Takikardia': 'Dugaan Takikardia',
    'DUGAAN_HIPOKSEMIA': 'Dugaan Hipoksemia',
    'HIPOKSEMIA': 'Dugaan Hipoksemia',
    'HIPOKSEMIA_RINGAN': 'Dugaan Hipoksemia',
    'HIPOKSEMIA_SEDANG': 'Dugaan Hipoksemia',
    'HIPOKSEMIA_BERAT': 'Dugaan Hipoksemia',
    'Dugaan Hipoksemia': 'Dugaan Hipoksemia',
    'WASPADA': 'Waspada',
    'Waspada': 'Waspada',
    'DARURAT': 'Darurat',
    'Darurat': 'Darurat',
  };
  return map[s] || 'Normal';
}

export function StatusBadge({ status, bpm, spo2, size = 'md' }: StatusBadgeProps) {
  let displayStatus: keyof typeof STATUS_COLORS;

  if (typeof bpm === 'number' && typeof spo2 === 'number') {
    displayStatus = calculateDiseaseStatus(bpm, spo2) as keyof typeof STATUS_COLORS;
  } else {
    displayStatus = normalizeStatus(status);
  }

  const colors = STATUS_COLORS[displayStatus] || STATUS_COLORS.Normal;
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full ${colors.bg} ${colors.text} ${sizeClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {displayStatus}
    </span>
  );
}
