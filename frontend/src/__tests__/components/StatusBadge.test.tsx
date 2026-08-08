// =============================================================================
// StatusBadge Component Tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/ui/StatusBadge';

// The StatusBadge uses STATUS_COLORS from @/constants which has:
//   Normal → bg-success-50, text-success-600, dot bg-success-500
//   Perlu Pemeriksaan → bg-warning-50, text-warning-600, dot bg-warning-500

describe('StatusBadge', () => {
  it('renders with the status text', () => {
    render(<StatusBadge status="Normal" />);
    expect(screen.getByText('Normal')).toBeInTheDocument();
  });

  it('renders Waspada as Perlu Pemeriksaan', () => {
    render(<StatusBadge status="Waspada" />);
    expect(screen.getByText('Perlu Pemeriksaan')).toBeInTheDocument();
  });

  it('renders Darurat as Perlu Pemeriksaan', () => {
    render(<StatusBadge status="Darurat" />);
    expect(screen.getByText('Perlu Pemeriksaan')).toBeInTheDocument();
  });

  it('renders PERLU_PEMERIKSAAN status', () => {
    render(<StatusBadge status="PERLU_PEMERIKSAAN" />);
    expect(screen.getByText('Perlu Pemeriksaan')).toBeInTheDocument();
  });

  it('applies success color classes for Normal status', () => {
    render(<StatusBadge status="Normal" />);
    const badge = screen.getByText('Normal');
    expect(badge.className).toContain('bg-success-50');
    expect(badge.className).toContain('text-success-600');
  });

  it('applies warning color classes for Perlu Pemeriksaan status', () => {
    render(<StatusBadge status="Waspada" />);
    const badge = screen.getByText('Perlu Pemeriksaan');
    expect(badge.className).toContain('bg-warning-50');
    expect(badge.className).toContain('text-warning-600');
  });

  it('uses sm size classes when size="sm"', () => {
    render(<StatusBadge status="Normal" size="sm" />);
    const badge = screen.getByText('Normal');
    expect(badge.className).toContain('text-xs');
    expect(badge.className).toContain('px-2');
    expect(badge.className).toContain('py-0.5');
  });

  it('uses md size classes when size="md" (default)', () => {
    render(<StatusBadge status="Normal" />);
    const badge = screen.getByText('Normal');
    expect(badge.className).toContain('text-sm');
    expect(badge.className).toContain('px-3');
    expect(badge.className).toContain('py-1');
  });

  it('renders a colored dot indicator', () => {
    render(<StatusBadge status="Normal" />);
    // The dot is the first span child
    const badge = screen.getByText('Normal');
    const dots = badge.querySelectorAll('span');
    expect(dots.length).toBeGreaterThan(0);
    // One of the spans should have the dot class
    const dotSpan = Array.from(dots).find(
      (span) => span.className.includes('rounded-full') && span.className.includes('bg-')
    );
    expect(dotSpan).toBeDefined();
  });

  describe('Disease Classification from BPM & SpO2 table', () => {
    it('classifies 60-100 BPM & 95-100% SpO2 as Normal', () => {
      render(<StatusBadge bpm={75} spo2={98} />);
      expect(screen.getByText('Normal')).toBeInTheDocument();
    });

    it('classifies <60 BPM & 95-100% SpO2 as Dugaan Bradikardia', () => {
      render(<StatusBadge bpm={50} spo2={97} />);
      expect(screen.getByText('Dugaan Bradikardia')).toBeInTheDocument();
    });

    it('classifies >100 BPM & 95-100% SpO2 as Dugaan Takikardia', () => {
      render(<StatusBadge bpm={115} spo2={98} />);
      expect(screen.getByText('Dugaan Takikardia')).toBeInTheDocument();
    });

    it('classifies SpO2 90-94% for any BPM as Penurunan Saturasi Oksigen', () => {
      render(<StatusBadge bpm={75} spo2={90} />);
      expect(screen.getByText('Penurunan Saturasi Oksigen')).toBeInTheDocument();
    });

    it('classifies SpO2 < 90% for any BPM as Dugaan Hipoksemia', () => {
      render(<StatusBadge bpm={75} spo2={88} />);
      expect(screen.getByText('Dugaan Hipoksemia')).toBeInTheDocument();
    });
  });
});
