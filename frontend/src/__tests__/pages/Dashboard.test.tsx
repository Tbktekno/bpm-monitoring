// =============================================================================
// Dashboard Page — Rendering Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock dashboard hook
const mockDashboardData = {
  totalPatients: 25,
  statusDistribution: {
    normal: 15,
    perluPemeriksaan: 10,
    tanpaData: 0,
  },
  averages: {
    avgBpm: 78,
    avgSpo2: 96,
    totalReadings: 50,
    range: '24h',
  },
  last10Readings: [
    {
      id: 1,
      patientId: 1,
      bpm: 72,
      spo2: 98,
      status: 'NORMAL',
      patient: { id: 1, patientId: 'P-001', name: 'Budi Santoso' },
      createdAt: '2026-07-07T08:30:00.000Z',
    },
    {
      id: 2,
      patientId: 2,
      bpm: 105,
      spo2: 91,
      status: 'WASPADA',
      patient: { id: 2, patientId: 'P-002', name: 'Siti Rahayu' },
      createdAt: '2026-07-07T08:25:00.000Z',
    },
    {
      id: 3,
      patientId: 3,
      bpm: 125,
      spo2: 88,
      status: 'DARURAT',
      patient: { id: 3, patientId: 'P-003', name: 'Ahmad Hidayat' },
      createdAt: '2026-07-07T08:20:00.000Z',
    },
  ],
  chartData: [],
  timestamp: '2026-07-07T08:00:00.000Z',
};

const mockRefetch = vi.fn();

vi.mock('@/hooks/useDashboard', () => ({
  useDashboard: () => ({
    data: mockDashboardData,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  }),
}));

// Mock socket hook
vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({
    on: vi.fn(() => vi.fn()), // returns cleanup function
  }),
}));

// Mock recharts to avoid rendering issues
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

import Dashboard from '@/pages/Dashboard';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('Dashboard Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dashboard title', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Ringkasan monitoring BPM & SpO₂')).toBeInTheDocument();
  });

  it('renders all stat card labels', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('Total Responden')).toBeInTheDocument();
    // These status labels appear both as stat-card <p> labels AND as StatusBadge <span> elements.
    // Use getAllByText and filter by tagName to find the stat-card label specifically.
    const normalStat = screen.getAllByText('Normal').find((el) => el.tagName === 'P');
    expect(normalStat).toBeDefined();
    const perluPemeriksaanStat = screen.getAllByText('Perlu Pemeriksaan').find((el) => el.tagName === 'P');
    expect(perluPemeriksaanStat).toBeDefined();
    expect(screen.getByText('Tanpa Data')).toBeInTheDocument();
  });

  it('renders stat card values', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders average BPM and SpO₂ cards', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('Rata-rata BPM')).toBeInTheDocument();
    expect(screen.getByText('Rata-rata SpO₂')).toBeInTheDocument();
    expect(screen.getByText('78')).toBeInTheDocument(); // avgBpm
    expect(screen.getByText('96')).toBeInTheDocument(); // avgSpo2
  });

  it('renders unit labels next to averages', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('bpm')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('renders chart section titles', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('BPM Real-time')).toBeInTheDocument();
    expect(screen.getByText('SpO₂ Real-time')).toBeInTheDocument();
  });

  it('renders latest readings table', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('10 Monitoring Terakhir')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('Jam')).toBeInTheDocument();
    expect(screen.getByText('Nama')).toBeInTheDocument();
    expect(screen.getByText('BPM')).toBeInTheDocument();
    expect(screen.getByText('SpO₂')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders patient names from latest readings', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('Siti Rahayu')).toBeInTheDocument();
    expect(screen.getByText('Ahmad Hidayat')).toBeInTheDocument();
  });

  it('renders BPM and SpO₂ values in the table', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('105')).toBeInTheDocument();
    expect(screen.getByText('125')).toBeInTheDocument();
    // SpO₂ values have % suffix
    expect(screen.getByText('98%')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
    expect(screen.getByText('88%')).toBeInTheDocument();
  });

  it('renders status badges in the readings table', () => {
    renderWithProviders(<Dashboard />);
    // Use getAllByText since 'Normal' appears both as a stat card label and as a badge
    const normalElements = screen.getAllByText('Normal');
    expect(normalElements.length).toBeGreaterThanOrEqual(1);
    // Find the one that's a StatusBadge (span element)
    const normalBadge = normalElements.find(
      (el) => el.tagName === 'SPAN' && el.className.includes('bg-success-50'),
    );
    expect(normalBadge).toBeDefined();

    // Disease status badges rendered from BPM/SpO2 readings
    expect(screen.getAllByText('Dugaan Hipoksemia').length).toBeGreaterThanOrEqual(1);
  });
});
