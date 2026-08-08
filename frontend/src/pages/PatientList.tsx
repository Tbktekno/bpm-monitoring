import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoPersonAddOutline, IoCreateOutline, IoTrashOutline } from 'react-icons/io5';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PatientFormModal } from '@/components/PatientFormModal';
import { usePatients, useDeletePatient } from '@/hooks/usePatients';
import { usePagination } from '@/hooks/usePagination';
import type { Patient } from '@/types';
import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';

function calculateAge(birthDate: string): number {
  try {
    const birth = parseISO(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  } catch {
    return 0;
  }
}

export default function PatientList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { page, goToPage, totalPages, resetPage, paginationParams } = usePagination();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);

  const { data, isLoading, error, refetch } = usePatients({ ...paginationParams, search });
  const deleteMutation = useDeletePatient();

  const patients = data?.items || [];
  const paginationInfo = data?.pagination;

  const handleSearch = (value: string) => {
    setSearch(value);
    resetPage();
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteMutation.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const columns: Column<Patient>[] = [
    { key: 'no', header: 'No', render: (_p, i) => <span className="text-slate-400 text-center">{i + 1}</span> },
    { key: 'patientId', header: 'ID', render: (p) => <span className="font-mono text-slate-500">{p.patientId}</span> },
    { key: 'name', header: 'Nama', render: (p) => <span className="font-medium text-slate-800">{p.name}</span> },
    { key: 'nik', header: 'NIK', render: (p) => p.nik },
    { key: 'gender', header: 'Gender', render: (p) => (
      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
        p.gender === 'L'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-pink-100 text-pink-700'
      }`}>
        {p.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
      </span>
    )},
    { key: 'age', header: 'Umur', render: (p) => `${calculateAge(p.birthDate)} tahun` },
    { key: 'status', header: 'Status', render: (p) => {
      const latestReading = p.readings?.[0];
      return <StatusBadge bpm={latestReading?.bpm} spo2={latestReading?.spo2} status={latestReading?.status || 'NORMAL'} size="sm" />;
    }},
    { key: 'actions', header: 'Aksi', render: (p) => (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setEditPatient(p)}
          className="p-1.5 rounded-lg hover:bg-primary-50 text-primary-500 transition-colors cursor-pointer"
          title="Edit"
        >
          <IoCreateOutline className="w-4 h-4" />
        </button>
        <button
          onClick={() => setDeleteId(String(p.id))}
          className="p-1.5 rounded-lg hover:bg-danger-50 text-danger-500 transition-colors cursor-pointer"
          title="Hapus"
        >
          <IoTrashOutline className="w-4 h-4" />
        </button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Data Responden</h1>
          <p className="text-sm text-slate-400 mt-1">Kelola data responden</p>
        </div>
        <Button
          variant="primary"
          icon={<IoPersonAddOutline />}
          onClick={() => setShowCreateModal(true)}
        >
          Tambah Responden
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-full sm:w-72">
          <SearchInput
            value={search}
            onChange={handleSearch}
            placeholder="Cari nama atau NIK..."
          />
        </div>
      </div>

      <Card padding="none">
        <DataTable
          columns={columns}
          data={patients}
          keyExtractor={(p) => String(p.id)}
          isLoading={isLoading}
          error={error || null}
          onRetry={() => refetch()}
          onRowClick={(p) => navigate(`/patients/${p.id}`)}
          emptyMessage={search ? 'Tidak ada responden yang sesuai dengan pencarian' : 'Belum ada data responden'}
          cardless
        />
        {paginationInfo && (
          <Pagination
            page={page}
            totalPages={totalPages(paginationInfo.total)}
            onPageChange={goToPage}
          />
        )}
      </Card>

      <PatientFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
      <PatientFormModal
        isOpen={!!editPatient}
        onClose={() => setEditPatient(null)}
        patient={editPatient ?? undefined}
      />
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Hapus Responden"
        message="Apakah Anda yakin ingin menghapus responden ini? Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Hapus"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
