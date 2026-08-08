// =============================================================================
// Status Calculator — BPM & SpO₂ Threshold Logic
// =============================================================================
// Centralised threshold definitions for vital-sign classification.
// All services (ingestion, alerts, dashboard) MUST use these functions
// to guarantee consistent status computation across the application.
// =============================================================================

/**
 * BPM status thresholds:
 *   < 60   → BRADICARDIA
 *   60–100 → NORMAL
 *   101–120 → TACHY_RINGAN (mild tachycardia)
 *   > 120  → TACHY_BERAT  (severe tachycardia)
 */
export function calculateBpmStatus(bpm: number): string {
  if (bpm < 60) return 'BRADICARDIA';
  if (bpm <= 100) return 'NORMAL';
  if (bpm <= 120) return 'TACHY_RINGAN';
  return 'TACHY_BERAT';
}

/**
 * SpO₂ status thresholds (percentage):
 *   ≥ 95 → NORMAL
 *   90–94 → HIPOKSEMIA_RINGAN (mild hypoxemia)
 *   85–89 → HIPOKSEMIA_SEDANG (moderate hypoxemia)
 *   < 85  → HIPOKSEMIA_BERAT  (severe hypoxemia)
 */
export function calculateSpo2Status(spo2: number): string {
  if (spo2 >= 95) return 'NORMAL';
  if (spo2 >= 90) return 'HIPOKSEMIA_RINGAN';
  if (spo2 >= 85) return 'HIPOKSEMIA_SEDANG';
  return 'HIPOKSEMIA_BERAT';
}

/**
 * Composite (overall) status derived from BPM + SpO₂:
 *
 *   NORMAL              ← both BPM and SpO₂ are within normal range
 *   PERLU_PEMERIKSAAN   ← one or both are outside the normal range
 */
export function calculateCompositeStatus(bpmStatus: string, spo2Status: string): string {
  if (bpmStatus === 'NORMAL' && spo2Status === 'NORMAL') return 'NORMAL';
  return 'PERLU_PEMERIKSAAN';
}

/**
 * Disease classification based on BPM & SpO₂ matrix:
 *   SpO₂ < 90%          → Dugaan Hipoksemia (Semua nilai BPM)
 *   SpO₂ 90-94%         → Penurunan Saturasi Oksigen
 *   SpO₂ >= 95% & <60   → Dugaan Bradikardia
 *   SpO₂ >= 95% & >100  → Dugaan Takikardia
 *   SpO₂ >= 95% & 60-100→ Normal
 */
export function calculateDiseaseClassification(bpm: number, spo2: number): string {
  if (spo2 < 90) return 'Dugaan Hipoksemia';
  if (spo2 < 95) return 'Penurunan Saturasi Oksigen';
  if (bpm < 60) return 'Dugaan Bradikardia';
  if (bpm > 100) return 'Dugaan Takikardia';
  return 'Normal';
}

/**
 * Convenience: compute all statuses from raw vital-sign values.
 */
export function calculateStatuses(bpm: number, spo2: number): {
  bpmStatus: string;
  spo2Status: string;
  status: string;
  diseaseStatus: string;
} {
  const bpmStatus = calculateBpmStatus(bpm);
  const spo2Status = calculateSpo2Status(spo2);
  const status = calculateCompositeStatus(bpmStatus, spo2Status);
  const diseaseStatus = calculateDiseaseClassification(bpm, spo2);
  return { bpmStatus, spo2Status, status, diseaseStatus };
}
