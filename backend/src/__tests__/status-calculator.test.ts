// =============================================================================
// Status Calculator — Unit Tests
// =============================================================================
// Tests for BPM & SpO₂ threshold logic, composite status computation,
// and boundary-value edge cases.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  calculateBpmStatus,
  calculateSpo2Status,
  calculateCompositeStatus,
  calculateStatuses,
  calculateDiseaseClassification,
} from '../shared/status-calculator';

// =============================================================================
// calculateBpmStatus
// =============================================================================
describe('calculateBpmStatus', () => {
  it('returns BRADICARDIA for BPM below 60', () => {
    expect(calculateBpmStatus(45)).toBe('BRADICARDIA');
    expect(calculateBpmStatus(0)).toBe('BRADICARDIA');
    expect(calculateBpmStatus(59)).toBe('BRADICARDIA');
  });

  it('returns NORMAL for BPM between 60 and 100 inclusive', () => {
    expect(calculateBpmStatus(60)).toBe('NORMAL');
    expect(calculateBpmStatus(75)).toBe('NORMAL');
    expect(calculateBpmStatus(100)).toBe('NORMAL');
  });

  it('returns TACHY_RINGAN for BPM between 101 and 120 inclusive', () => {
    expect(calculateBpmStatus(101)).toBe('TACHY_RINGAN');
    expect(calculateBpmStatus(110)).toBe('TACHY_RINGAN');
    expect(calculateBpmStatus(120)).toBe('TACHY_RINGAN');
  });

  it('returns TACHY_BERAT for BPM above 120', () => {
    expect(calculateBpmStatus(121)).toBe('TACHY_BERAT');
    expect(calculateBpmStatus(130)).toBe('TACHY_BERAT');
    expect(calculateBpmStatus(200)).toBe('TACHY_BERAT');
  });
});

// =============================================================================
// calculateSpo2Status
// =============================================================================
describe('calculateSpo2Status', () => {
  it('returns NORMAL for SpO₂ >= 95', () => {
    expect(calculateSpo2Status(95)).toBe('NORMAL');
    expect(calculateSpo2Status(98)).toBe('NORMAL');
    expect(calculateSpo2Status(100)).toBe('NORMAL');
  });

  it('returns HIPOKSEMIA_RINGAN for SpO₂ 90-94', () => {
    expect(calculateSpo2Status(90)).toBe('HIPOKSEMIA_RINGAN');
    expect(calculateSpo2Status(92)).toBe('HIPOKSEMIA_RINGAN');
    expect(calculateSpo2Status(94)).toBe('HIPOKSEMIA_RINGAN');
  });

  it('returns HIPOKSEMIA_SEDANG for SpO₂ 85-89', () => {
    expect(calculateSpo2Status(85)).toBe('HIPOKSEMIA_SEDANG');
    expect(calculateSpo2Status(87)).toBe('HIPOKSEMIA_SEDANG');
    expect(calculateSpo2Status(89)).toBe('HIPOKSEMIA_SEDANG');
  });

  it('returns HIPOKSEMIA_BERAT for SpO₂ below 85', () => {
    expect(calculateSpo2Status(80)).toBe('HIPOKSEMIA_BERAT');
    expect(calculateSpo2Status(84)).toBe('HIPOKSEMIA_BERAT');
    expect(calculateSpo2Status(0)).toBe('HIPOKSEMIA_BERAT');
  });
});

// =============================================================================
// calculateCompositeStatus
// =============================================================================
describe('calculateCompositeStatus', () => {
  it('returns NORMAL when both BPM and SpO₂ are NORMAL', () => {
    expect(calculateCompositeStatus('NORMAL', 'NORMAL')).toBe('NORMAL');
  });

  it('returns DARURAT when BPM is BRADICARDIA', () => {
    expect(calculateCompositeStatus('BRADICARDIA', 'NORMAL')).toBe('DARURAT');
    expect(calculateCompositeStatus('BRADICARDIA', 'HIPOKSEMIA_RINGAN')).toBe('DARURAT');
  });

  it('returns DARURAT when BPM is TACHY_BERAT', () => {
    expect(calculateCompositeStatus('TACHY_BERAT', 'NORMAL')).toBe('DARURAT');
    expect(calculateCompositeStatus('TACHY_BERAT', 'HIPOKSEMIA_RINGAN')).toBe('DARURAT');
  });

  it('returns DARURAT when SpO₂ is HIPOKSEMIA_SEDANG', () => {
    expect(calculateCompositeStatus('NORMAL', 'HIPOKSEMIA_SEDANG')).toBe('DARURAT');
    expect(calculateCompositeStatus('TACHY_RINGAN', 'HIPOKSEMIA_SEDANG')).toBe('DARURAT');
  });

  it('returns DARURAT when SpO₂ is HIPOKSEMIA_BERAT', () => {
    expect(calculateCompositeStatus('NORMAL', 'HIPOKSEMIA_BERAT')).toBe('DARURAT');
    expect(calculateCompositeStatus('TACHY_RINGAN', 'HIPOKSEMIA_BERAT')).toBe('DARURAT');
  });

  it('returns WASPADA when one or both are mildly abnormal', () => {
    // Tachy ringan with normal SpO₂
    expect(calculateCompositeStatus('TACHY_RINGAN', 'NORMAL')).toBe('WASPADA');
    // Normal BPM with mild hypoxemia
    expect(calculateCompositeStatus('NORMAL', 'HIPOKSEMIA_RINGAN')).toBe('WASPADA');
    // Both mildly abnormal
    expect(calculateCompositeStatus('TACHY_RINGAN', 'HIPOKSEMIA_RINGAN')).toBe('WASPADA');
  });
});

// =============================================================================
// calculateStatuses (convenience wrapper)
// =============================================================================
describe('calculateStatuses', () => {
  it('returns all three statuses for normal values', () => {
    const result = calculateStatuses(75, 98);
    expect(result).toEqual({
      bpmStatus: 'NORMAL',
      spo2Status: 'NORMAL',
      status: 'NORMAL',
      diseaseStatus: 'Normal',
    });
  });

  it('returns correct statuses for bradycardia + normal SpO₂', () => {
    const result = calculateStatuses(55, 97);
    expect(result.bpmStatus).toBe('BRADICARDIA');
    expect(result.spo2Status).toBe('NORMAL');
    expect(result.status).toBe('DARURAT');
  });

  it('returns correct statuses for severe tachycardia + severe hypoxemia', () => {
    const result = calculateStatuses(130, 80);
    expect(result.bpmStatus).toBe('TACHY_BERAT');
    expect(result.spo2Status).toBe('HIPOKSEMIA_BERAT');
    expect(result.status).toBe('DARURAT');
  });

  it('returns correct statuses for mild tachycardia + mild hypoxemia', () => {
    const result = calculateStatuses(110, 92);
    expect(result.bpmStatus).toBe('TACHY_RINGAN');
    expect(result.spo2Status).toBe('HIPOKSEMIA_RINGAN');
    expect(result.status).toBe('WASPADA');
  });
});

// =============================================================================
// Boundary value tests
// =============================================================================
describe('boundary values', () => {
  describe('BPM exact boundary values', () => {
    it('classifies 60 as NORMAL (lower bound)', () => {
      expect(calculateBpmStatus(60)).toBe('NORMAL');
    });
    it('classifies 59 as BRADICARDIA (just below normal)', () => {
      expect(calculateBpmStatus(59)).toBe('BRADICARDIA');
    });
    it('classifies 100 as NORMAL (upper bound of normal)', () => {
      expect(calculateBpmStatus(100)).toBe('NORMAL');
    });
    it('classifies 101 as TACHY_RINGAN (just above normal)', () => {
      expect(calculateBpmStatus(101)).toBe('TACHY_RINGAN');
    });
    it('classifies 120 as TACHY_RINGAN (upper bound)', () => {
      expect(calculateBpmStatus(120)).toBe('TACHY_RINGAN');
    });
    it('classifies 121 as TACHY_BERAT (just above ringan)', () => {
      expect(calculateBpmStatus(121)).toBe('TACHY_BERAT');
    });
  });

  describe('SpO₂ exact boundary values', () => {
    it('classifies 95 as NORMAL (lower bound)', () => {
      expect(calculateSpo2Status(95)).toBe('NORMAL');
    });
    it('classifies 94 as HIPOKSEMIA_RINGAN (just below normal)', () => {
      expect(calculateSpo2Status(94)).toBe('HIPOKSEMIA_RINGAN');
    });
    it('classifies 90 as HIPOKSEMIA_RINGAN (lower bound of ringan)', () => {
      expect(calculateSpo2Status(90)).toBe('HIPOKSEMIA_RINGAN');
    });
    it('classifies 89 as HIPOKSEMIA_SEDANG (just below ringan)', () => {
      expect(calculateSpo2Status(89)).toBe('HIPOKSEMIA_SEDANG');
    });
    it('classifies 85 as HIPOKSEMIA_SEDANG (lower bound of sedang)', () => {
      expect(calculateSpo2Status(85)).toBe('HIPOKSEMIA_SEDANG');
    });
    it('classifies 84 as HIPOKSEMIA_BERAT (just below sedang)', () => {
      expect(calculateSpo2Status(84)).toBe('HIPOKSEMIA_BERAT');
    });
  });

  describe('calculateDiseaseClassification', () => {
    it('classifies 60-100 BPM & 95-100% SpO2 as Normal', () => {
      expect(calculateDiseaseClassification(75, 98)).toBe('Normal');
      expect(calculateDiseaseClassification(60, 95)).toBe('Normal');
      expect(calculateDiseaseClassification(100, 100)).toBe('Normal');
    });

    it('classifies <60 BPM & 95-100% SpO2 as Dugaan Bradikardia', () => {
      expect(calculateDiseaseClassification(55, 97)).toBe('Dugaan Bradikardia');
      expect(calculateDiseaseClassification(0, 95)).toBe('Dugaan Bradikardia');
      expect(calculateDiseaseClassification(59, 99)).toBe('Dugaan Bradikardia');
    });

    it('classifies >100 BPM & 95-100% SpO2 as Dugaan Takikardia', () => {
      expect(calculateDiseaseClassification(105, 96)).toBe('Dugaan Takikardia');
      expect(calculateDiseaseClassification(140, 100)).toBe('Dugaan Takikardia');
    });

    it('classifies SpO2 < 95% for any BPM as Dugaan Hipoksemia', () => {
      expect(calculateDiseaseClassification(75, 94)).toBe('Dugaan Hipoksemia');
      expect(calculateDiseaseClassification(50, 90)).toBe('Dugaan Hipoksemia');
      expect(calculateDiseaseClassification(130, 85)).toBe('Dugaan Hipoksemia');
    });
  });
});
