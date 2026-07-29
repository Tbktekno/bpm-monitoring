// =============================================================================
// PatientList Page — Rendering Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock patients hook
const mockPatients = [
  {
    id: 1,
    patientId: 'P-001',
    name: 'Budi Santoso',
    nik: '3201012000010001',
    gender: 'L' as const,
    birthDate: '1990-01-15',
    readings: [{ status: 'NORMAL', bpm: 72, spo2: 98, createdAt: '2026-07-07T08:30:00.000Z' }],
  },
  {
    id: 2,
    patientId: 'P-002',
    name: 'Siti Rahayu',
    nik: '3201012000020002',
    gender: 'P' as const,
    birthDate: '1985-06-20',
    readings: [{ status: 'WASPADA', bpm: 105, spo2: 91, createdAt: '2026-07-07T08:25:00.000Z' }],
  },
  {
    id: 3,
    patientId: 'P-003',
    name: 'Ahmad Hidayat',
    nik: '3201012000030003',
    gender: 'L' as const,
    birthDate: '2000-12-10',
    readings: [{ status: 'DARURAT', bpm: 125, spo2: 88, createdAt: '2026-07-07T08:20:00.000Z' }],
  },
];

const mockRefetch = vi.fn();
const mockMutateAsync = vi.fn();

vi.mock('@/hooks/usePatients', () => ({
  usePatients: () => ({
    data: { items: mockPatients, pagination: { total: 3, page: 1, limit: 10, totalPages: 1 } },
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  }),
  useDeletePatient: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  useCreatePatient: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUpdatePatient: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/hooks/usePagination', () => ({
  usePagination: () => ({
    page: 1,
    goToPage: vi.fn(),
    totalPages: vi.fn(() => 1),
    resetPage: vi.fn(),
    paginationParams: { page: 1, limit: 10 },
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useLogout: () => vi.fn(),
}));

import PatientList from '@/pages/PatientList';

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

describe('PatientList Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title', () => {
    renderWithProviders(<PatientList />);
    expect(screen.getByText('Data Pasien')).toBeInTheDocument();
    expect(screen.getByText('Kelola data pasien')).toBeInTheDocument();
  });

  it('renders the "Tambah Pasien" button', () => {
    renderWithProviders(<PatientList />);
    expect(screen.getByText('Tambah Pasien')).toBeInTheDocument();
  });

  it('renders search input', () => {
    renderWithProviders(<PatientList />);
    const searchInput = screen.getByPlaceholderText('Cari nama atau NIK...');
    expect(searchInput).toBeInTheDocument();
  });

  it('renders table headers', () => {
    renderWithProviders(<PatientList />);
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Nama')).toBeInTheDocument();
    expect(screen.getByText('NIK')).toBeInTheDocument();
    expect(screen.getByText('Gender')).toBeInTheDocument();
    expect(screen.getByText('Umur')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Aksi')).toBeInTheDocument();
  });

  it('renders patient names in the table', () => {
    renderWithProviders(<PatientList />);
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByText('Siti Rahayu')).toBeInTheDocument();
    expect(screen.getByText('Ahmad Hidayat')).toBeInTheDocument();
  });

  it('renders patient IDs', () => {
    renderWithProviders(<PatientList />);
    expect(screen.getByText('P-001')).toBeInTheDocument();
    expect(screen.getByText('P-002')).toBeInTheDocument();
    expect(screen.getByText('P-003')).toBeInTheDocument();
  });

  it('renders patient NIK numbers', () => {
    renderWithProviders(<PatientList />);
    expect(screen.getByText('3201012000010001')).toBeInTheDocument();
    expect(screen.getByText('3201012000020002')).toBeInTheDocument();
    expect(screen.getByText('3201012000030003')).toBeInTheDocument();
  });

  it('renders gender labels correctly', () => {
    renderWithProviders(<PatientList />);
    // There are 2 male patients and 1 female patient
    const lakiLakiElements = screen.getAllByText('Laki-laki');
    expect(lakiLakiElements).toHaveLength(2);
    const perempuanElements = screen.getAllByText('Perempuan');
    expect(perempuanElements).toHaveLength(1);
  });

  it('renders age for each patient', () => {
    renderWithProviders(<PatientList />);
    // Ages depend on current date; we just verify there are 3 age entries
    const ageElements = screen.getAllByText(/tahun/);
    expect(ageElements).toHaveLength(3);
  });

  it('renders status badges for all patients', () => {
    renderWithProviders(<PatientList />);
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getAllByText('Dugaan Hipoksemia').length).toBeGreaterThanOrEqual(1);
  });

  it('renders edit and delete action buttons', () => {
    renderWithProviders(<PatientList />);
    // Each patient row should have edit and delete buttons
    const editButtons = screen.getAllByTitle('Edit');
    const deleteButtons = screen.getAllByTitle('Hapus');
    expect(editButtons).toHaveLength(3);
    expect(deleteButtons).toHaveLength(3);
  });
});
