import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { IoArrowBack } from 'react-icons/io5';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { usePatient } from '@/hooks/usePatients';
import { useMonitoringByPatient } from '@/hooks/useMonitoring';
import { useSocket } from '@/hooks/useSocket';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
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

function formatTime(timestamp: string) {
  try {
    return format(parseISO(timestamp), 'HH:mm:ss', { locale: id });
  } catch {
    return '--:--';
  }
}

export default function MonitoringDetail() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { on } = useSocket();
  const [latestReading, setLatestReading] = useState<MonitoringReading | null>(null);

  const { data: patient, isLoading: loadingPatient } = usePatient(patientId || '');
  const { data: monitorData, isLoading: loadingMonitor, error, refetch } = useMonitoringByPatient(patientId || '', { limit: 50 });

  useEffect(() => {
    const cleanup = on('monitoring:update', (data: unknown) => {
      const payload = data as { type?: string; reading?: MonitoringReading };
      const update = payload?.reading;
      if (update && update.patientId === Number(patientId)) {
        setLatestReading(update);
        queryClient.invalidateQueries({ queryKey: ['monitoring', 'patient', patientId] });
      }
    });
    return cleanup;
  }, [on, queryClient, patientId]);

  if (loadingPatient || loadingMonitor) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message="Gagal memuat data monitoring" onRetry={() => refetch()} />;
  }

  const readings = monitorData?.readings || [];
  const currentReading = latestReading || (readings.length > 0 ? readings[0] : null);

  const chartData = readings
    .slice()
    .reverse()
    .slice(-30)
    .map((r: MonitoringReading) => ({
      time: formatTime(r.createdAt),
      bpm: r.bpm,
      spo2: r.spo2,
    }));

  const columns: Column<MonitoringReading>[] = [
    { key: 'date', header: 'Tanggal', render: (r) => format(new Date(r.createdAt), 'dd MMM yyyy', { locale: id }) },
    { key: 'time', header: 'Jam', render: (r) => formatTime(r.createdAt) },
    { key: 'bpm', header: 'BPM', render: (r) => (
      <span className={`text-sm font-semibold ${r.bpm < 60 || r.bpm > 100 ? 'text-danger-500' : 'text-success-500'}`}>{r.bpm}</span>
    )},
    { key: 'spo2', header: 'SpO₂', render: (r) => (
      <span className={`text-sm font-semibold ${r.spo2 < 95 ? 'text-danger-500' : 'text-blue-500'}`}>{r.spo2}%</span>
    )},
    { key: 'status', header: 'Status', render: (r) => <StatusBadge bpm={r.bpm} spo2={r.spo2} status={r.status} size="sm" /> },
  ];

  return (
    <div className="space-y-6">
      <Button variant="ghost" icon={<IoArrowBack />} onClick={() => navigate('/monitoring')}>
        Kembali ke Monitoring
      </Button>

      {/* Patient Info Header */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {patient?.name || 'Responden'}
            </h1>
            <p className="text-sm text-slate-400 mt-1">ID: {patient?.patientId || patientId}</p>
          </div>
          {currentReading && (
            <StatusBadge bpm={currentReading.bpm} spo2={currentReading.spo2} status={currentReading.status} />
          )}
        </div>

        {currentReading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <div className="text-center p-4 rounded-xl bg-danger-50">
              <p className="text-xs text-slate-500 mb-1">BPM</p>
              <p className={`text-3xl font-bold ${
                currentReading.bpm < 60 || currentReading.bpm > 100
                  ? 'text-danger-500'
                  : 'text-success-500'
              }`}>
                {currentReading.bpm}
              </p>
              <p className="text-xs text-slate-400 mt-1">detak/menit</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-blue-50">
              <p className="text-xs text-slate-500 mb-1">SpO₂</p>
              <p className={`text-3xl font-bold ${
                currentReading.spo2 < 95 ? 'text-danger-500' : 'text-blue-500'
              }`}>
                {currentReading.spo2}%
              </p>
              <p className="text-xs text-slate-400 mt-1">oksigen</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-gray-50">
              <p className="text-xs text-slate-500 mb-1">Status Klasifikasi</p>
              <StatusBadge bpm={currentReading.bpm} spo2={currentReading.spo2} status={currentReading.status} />
            </div>
            <div className="text-center p-4 rounded-xl bg-gray-50">
              <p className="text-xs text-slate-500 mb-1">Update</p>
              <p className="text-lg font-semibold text-slate-700">
                {formatTime(currentReading.timestamp)}
              </p>
              <p className="text-xs text-slate-400 mt-1">real-time</p>
            </div>
          </div>
        )}
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-semibold text-slate-700 mb-4">BPM Real-time</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                <Line type="monotone" dataKey="bpm" stroke="#EF4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-slate-400">
              Menunggu data real-time...
            </div>
          )}
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-slate-700 mb-4">SpO₂ Real-time</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" domain={[90, 100]} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                <Line type="monotone" dataKey="spo2" stroke="#2563EB" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-sm text-slate-400">
              Menunggu data real-time...
            </div>
          )}
        </Card>
      </div>

      {/* Latest Readings Table */}
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Riwayat Monitoring</h3>
        <DataTable
          columns={columns}
          data={readings}
          keyExtractor={(r) => r.id}
          emptyMessage="Belum ada data monitoring"
          cardless
        />
      </Card>
    </div>
  );
}
