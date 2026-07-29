import { useEffect, useState } from 'react';
import { IoPeopleOutline, IoCheckmarkCircleOutline, IoWarningOutline, IoAlertCircleOutline, IoHeart, IoWaterOutline, IoPulseOutline } from 'react-icons/io5';
import { StatCard } from '@/components/ui/StatCard';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { ErrorState } from '@/components/ui/ErrorState';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useDashboard } from '@/hooks/useDashboard';
import { useSocket } from '@/hooks/useSocket';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { monitoringService } from '@/services/monitoring.service';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import type { MonitoringReading } from '@/types';

function formatTime(timestamp: string) {
  try {
    return format(parseISO(timestamp), 'HH:mm', { locale: id });
  } catch {
    return '--:--';
  }
}

function getPatientName(reading: MonitoringReading): string {
  return reading.patient?.name || 'Tidak Diketahui';
}

export default function Dashboard() {
  const { data: stats, isLoading, error, refetch } = useDashboard();
  const queryClient = useQueryClient();
  const { on } = useSocket();
  const [realtimeData, setRealtimeData] = useState<{ time: string; bpm: number; spo2: number }[]>([]);

  // Fetch completed sessions
  const { data: sessionsData } = useQuery({
    queryKey: ['monitoring', 'sessions', 'completed'],
    queryFn: () => monitoringService.getSessions({ status: 'COMPLETED', limit: 5 }),
    refetchInterval: 30000,
  });
  const recentSessions = sessionsData?.items || [];

  useEffect(() => {
    const cleanup = on('monitoring:update', (data: unknown) => {
      const payload = data as { type?: string; reading?: MonitoringReading };
      const reading = payload?.reading;
      if (reading) {
        setRealtimeData((prev) => {
          const newPoint = {
            time: formatTime(reading.createdAt),
            bpm: reading.bpm,
            spo2: reading.spo2,
          };
          const updated = [...prev, newPoint];
          // Keep last 20 data points
          return updated.slice(-20);
        });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
    });
    return cleanup;
  }, [on, queryClient]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message="Gagal memuat dashboard" onRetry={() => refetch()} />;
  }

  const latestReadings = stats?.last10Readings || [];

  const chartData = realtimeData.length > 0
    ? realtimeData
    : latestReadings.map((r) => ({
        time: formatTime(r.createdAt),
        bpm: r.bpm,
        spo2: r.spo2,
      })).reverse();

function bpmColor(bpm: number): string {
  if (bpm >= 60 && bpm <= 100) return 'bg-green-100 text-green-700';
  if (bpm >= 101 && bpm <= 120) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function spo2Color(spo2: number): string {
  if (spo2 >= 95) return 'bg-green-100 text-green-700';
  if (spo2 >= 90) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

  const columns: Column<MonitoringReading>[] = [
    { key: 'time', header: 'Jam', render: (r) => formatTime(r.createdAt) },
    { key: 'name', header: 'Nama', render: (r) => getPatientName(r) },
    { key: 'bpm', header: 'BPM', render: (r) => (
      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${bpmColor(r.bpm)}`}>
        {r.bpm}
      </span>
    )},
    { key: 'spo2', header: 'SpO₂', render: (r) => (
      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${spo2Color(r.spo2)}`}>
        {r.spo2}%
      </span>
    )},
    { key: 'status', header: 'Status', render: (r) => <StatusBadge bpm={r.bpm} spo2={r.spo2} status={r.status} size="sm" /> },
  ];

  const statCards = [
    {
      icon: <IoPeopleOutline />,
      label: 'Total Pasien',
      value: stats?.totalPatients ?? 0,
      color: 'primary' as const,
    },
    {
      icon: <IoCheckmarkCircleOutline />,
      label: 'Normal',
      value: stats?.statusDistribution?.normal ?? 0,
      color: 'success' as const,
    },
    {
      icon: <IoWarningOutline />,
      label: 'Waspada',
      value: stats?.statusDistribution?.waspada ?? 0,
      color: 'warning' as const,
    },
    {
      icon: <IoAlertCircleOutline />,
      label: 'Darurat',
      value: stats?.statusDistribution?.darurat ?? 0,
      color: 'danger' as const,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Ringkasan monitoring BPM & SpO₂</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      {/* Recent Sessions */}
      {recentSessions.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <IoPulseOutline className="w-5 h-5 text-primary-500" />
            <h3 className="text-sm font-semibold text-slate-700">Sesi Monitoring Terakhir</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {recentSessions.map((s) => (
              <div key={s.id} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-400">{s.patient?.name || '-'}</p>
                <p className="text-lg font-bold text-primary-600">{s._count?.readings || 0}</p>
                <p className="text-xs text-slate-400">data</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Average Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-danger-50">
              <IoHeart className="w-5 h-5 text-danger-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-500">Rata-rata BPM</p>
              <p className="text-2xl font-bold text-slate-900">
                {stats?.averages?.avgBpm ? Math.round(stats.averages.avgBpm) : 0}
                <span className="text-sm font-normal text-slate-400 ml-1">bpm</span>
              </p>
              {stats?.averages?.range && stats.averages.range !== 'none' && (
                <p className="text-xs text-slate-400 mt-0.5">
                  dari {stats.averages.totalReadings} data
                  {stats.averages.range === '24h' ? ' (24 jam)' : stats.averages.range === '168h' ? ' (7 hari)' : ' (semua waktu)'}
                </p>
              )}
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-blue-50">
              <IoWaterOutline className="w-5 h-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-500">Rata-rata SpO₂</p>
              <p className="text-2xl font-bold text-slate-900">
                {stats?.averages?.avgSpo2 ? Math.round(stats.averages.avgSpo2) : 0}
                <span className="text-sm font-normal text-slate-400 ml-1">%</span>
              </p>
              {stats?.averages?.range && stats.averages.range !== 'none' && (
                <p className="text-xs text-slate-400 mt-0.5">
                  dari {stats.averages.totalReadings} data
                  {stats.averages.range === '24h' ? ' (24 jam)' : stats.averages.range === '168h' ? ' (7 hari)' : ' (semua waktu)'}
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-semibold text-slate-700 mb-4">BPM Real-time</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="bpm"
                  stroke="#EF4444"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#EF4444' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">
              Belum ada data real-time
            </div>
          )}
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-slate-700 mb-4">SpO₂ Real-time</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" domain={[90, 100]} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="spo2"
                  stroke="#2563EB"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#2563EB' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">
              Belum ada data real-time
            </div>
          )}
        </Card>
      </div>

      {/* Latest Readings Table */}
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-4">10 Monitoring Terakhir</h3>
        <DataTable
          columns={columns}
          data={latestReadings}
          keyExtractor={(r) => r.id}
          emptyMessage="Belum ada data monitoring"
          cardless
        />
      </Card>
    </div>
  );
}
