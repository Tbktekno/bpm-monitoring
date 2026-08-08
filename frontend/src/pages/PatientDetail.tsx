import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { IoArrowBack, IoCreateOutline, IoTrashOutline } from 'react-icons/io5';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PatientFormModal } from '@/components/PatientFormModal';
import { usePatient, useDeletePatient, usePatients } from '@/hooks/usePatients';
import { useMonitoringByPatient } from '@/hooks/useMonitoring';
import { useSocket } from '@/hooks/useSocket';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { format, parseISO, differenceInYears } from 'date-fns';
import { id } from 'date-fns/locale';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { MonitoringReading } from '@/types';

function formatDate(dateStr: string) {
  try {
    return format(parseISO(dateStr), 'dd MMMM yyyy', { locale: id });
  } catch {
    return dateStr;
  }
}

function formatTime(dateStr: string) {
  try {
    return format(parseISO(dateStr), 'HH:mm', { locale: id });
  } catch {
    return '--:--';
  }
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showDelete, setShowDelete] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const queryClient = useQueryClient();
  const { on } = useSocket();

  const { data: patient, isLoading, error, refetch } = usePatient(id || '');
  const { data: monitoringData, isLoading: loadingMonitor } = useMonitoringByPatient(id || '', { limit: 50 });
  const deleteMutation = useDeletePatient();

  useEffect(() => {
    const cleanup = on('monitoring:update', (data: unknown) => {
      const update = data as { patientId?: string };
      if (update?.patientId === id) {
        queryClient.invalidateQueries({ queryKey: ['monitoring', 'patient', id] });
      }
    });
    return cleanup;
  }, [on, queryClient, id]);

  const readings = monitoringData?.readings || [];
  const chartData = readings.slice(-20).reverse().map((r: MonitoringReading) => ({
    time: formatTime(r.createdAt),
    bpm: r.bpm,
    spo2: r.spo2,
  }));

  const handleDelete = async () => {
    if (id) {
      await deleteMutation.mutateAsync(id);
      navigate('/patients');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !patient) {
    return <ErrorState message="Responden tidak ditemukan" onRetry={() => refetch()} />;
  }

  const age = differenceInYears(new Date(), parseISO(patient.birthDate));

  const columns: Column<MonitoringReading>[] = [
    { key: 'date', header: 'Tanggal', render: (r) => formatDate(r.createdAt) },
    { key: 'time', header: 'Jam', render: (r) => formatTime(r.createdAt) },
    { key: 'bpm', header: 'BPM', render: (r) => <span className="text-slate-700">{r.bpm}</span> },
    { key: 'spo2', header: 'SpO₂', render: (r) => <span className="text-slate-700">{r.spo2}%</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge bpm={r.bpm} spo2={r.spo2} status={r.status} size="sm" /> },
  ];

  const latestReading = readings.length > 0 ? readings[0] : null;

  return (
    <div className="space-y-6">
      {/* Back & Actions */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" icon={<IoArrowBack />} onClick={() => navigate('/patients')}>
          Kembali
        </Button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            icon={<IoCreateOutline />}
            onClick={() => setShowEditModal(true)}
          >
            Edit
          </Button>
          <Button
            variant="danger"
            icon={<IoTrashOutline />}
            onClick={() => setShowDelete(true)}
          >
            Hapus
          </Button>
        </div>
      </div>

      {/* Patient Info Card */}
      <Card>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{patient.name}</h1>
            <p className="text-sm text-slate-400 mt-1">ID: {patient.patientId}</p>
          </div>
          <StatusBadge bpm={latestReading?.bpm} spo2={latestReading?.spo2} status={patient.status || 'Normal'} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoItem label="NIK" value={patient.nik} />
          <InfoItem label="Gender" value={patient.gender === 'L' ? 'Laki-laki' : 'Perempuan'} />
          <InfoItem label="Tanggal Lahir" value={formatDate(patient.birthDate)} />
          <InfoItem label="Umur" value={`${age} tahun`} />
          <InfoItem label="Alamat" value={patient.address} />
          <InfoItem label="No. Telepon" value={patient.phone} />
          <InfoItem label="Golongan Darah" value={patient.bloodType} />
          <InfoItem label="Tinggi Badan" value={`${patient.height} cm`} />
          <InfoItem label="Berat Badan" value={`${patient.weight} kg`} />
        </div>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-semibold text-slate-700 mb-4">BPM (24 Jam Terakhir)</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                <Line type="monotone" dataKey="bpm" stroke="#EF4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">
              Belum ada data
            </div>
          )}
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-slate-700 mb-4">SpO₂ (24 Jam Terakhir)</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" domain={[90, 100]} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                <Line type="monotone" dataKey="spo2" stroke="#2563EB" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">
              Belum ada data
            </div>
          )}
        </Card>
      </div>

      {/* Recent Readings */}
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Monitoring Terbaru</h3>
        <DataTable
          columns={columns}
          data={readings}
          keyExtractor={(r) => r.id}
          emptyMessage="Belum ada data monitoring"
          cardless
        />
      </Card>

      <PatientFormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        patient={patient}
      />
      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Hapus Responden"
        message={`Apakah Anda yakin ingin menghapus ${patient.name}? Semua data monitoring akan ikut terhapus.`}
        confirmLabel="Hapus"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

function InfoItem({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? 'col-span-full' : ''}>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}
