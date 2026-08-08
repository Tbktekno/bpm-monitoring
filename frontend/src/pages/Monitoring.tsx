import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { useSocket } from '@/hooks/useSocket';
import { patientsService } from '@/services/patients.service';
import { monitoringService, type SessionData } from '@/services/monitoring.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  ReferenceLine,
} from 'recharts';
import type { Patient, MonitoringReading } from '@/types';

function formatTime(timestamp: string) {
  try {
    return format(parseISO(timestamp), 'HH:mm:ss', { locale: id });
  } catch {
    return '--:--';
  }
}

function formatDate(timestamp: string) {
  try {
    return format(parseISO(timestamp), 'dd MMM yyyy HH:mm', { locale: id });
  } catch {
    return '--';
  }
}

export default function Monitoring() {
  const queryClient = useQueryClient();
  const { on, emit } = useSocket();

  // Patient & session state
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  // Modal hasil sesi
  const [showResultModal, setShowResultModal] = useState(false);
  const [sessionResult, setSessionResult] = useState<SessionData | null>(null);

  // Chart data
  const [chartData, setChartData] = useState<{ time: string; bpm: number; spo2: number }[]>([]);
  const [latestReading, setLatestReading] = useState<MonitoringReading | null>(null);

  // Session timer
  const [elapsed, setElapsed] = useState('00:00');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch all patients
  const {
    data: patientsData,
    isLoading: loadingPatients,
    error: patientsError,
  } = useQuery({
    queryKey: ['patients', 'list'],
    queryFn: () => patientsService.getAll({ limit: 100 }),
  });
  const patients: Patient[] = patientsData?.items || [];

  // Cek apakah ada session aktif untuk device tertentu
  const { data: sessionsData } = useQuery({
    queryKey: ['monitoring', 'sessions', 'active'],
    queryFn: () => monitoringService.getSessions({ status: 'ACTIVE', limit: 10 }),
    refetchInterval: 30000,
  });

  // Auto-load session jika ada yang aktif untuk device ESP32-ALPHA-001
  useEffect(() => {
    if (sessionsData?.items?.length) {
      const active = sessionsData.items[0];
      setActiveSession(active);
      setSelectedPatientId(String(active.patientId));
    }
  }, [sessionsData]);

  // Timer untuk sesi aktif
  useEffect(() => {
    if (activeSession && activeSession.status === 'ACTIVE') {
      timerRef.current = setInterval(() => {
        const start = new Date(activeSession.startTime).getTime();
        const diff = Date.now() - start;
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setElapsed(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeSession]);

  // Reset chart data saat memulai sesi baru
  const handleStartSession = async () => {
    if (!selectedPatientId) return;
    setSessionLoading(true);
    try {
      const session = await monitoringService.startSession(
        Number(selectedPatientId),
        'ESP32-ALPHA-001'
      );
      setActiveSession(session);
      setChartData([]);               // Reset chart — mulai dari 0!
      setLatestReading(null);
      setElapsed('00:00');
      queryClient.invalidateQueries({ queryKey: ['monitoring', 'sessions'] });
    } catch {
      // Gagal start — biarkan user coba lagi
    } finally {
      setSessionLoading(false);
    }
  };

  const handleStopSession = async () => {
    if (!activeSession) return;
    setSessionLoading(true);
    try {
      const stopped = await monitoringService.stopSession(activeSession.id);
      setSessionResult(stopped);           // Simpan hasil untuk modal
      setShowResultModal(true);             // Tampilkan modal hasil
      setActiveSession(null);
      setElapsed('00:00');
      queryClient.invalidateQueries({ queryKey: ['monitoring', 'sessions'] });
      queryClient.invalidateQueries({ queryKey: ['monitoring', 'history'] });
    } catch {
      // Gagal stop — biarkan user coba lagi
    } finally {
      setSessionLoading(false);
    }
  };

  // Fetch readings for selected patient
  const {
    data: monitorData,
    isLoading: loadingMonitor,
    error: monitorError,
  } = useQuery({
    queryKey: ['monitoring', 'patient', selectedPatientId],
    queryFn: () => monitoringService.getByPatient(selectedPatientId, { limit: 50 }),
    enabled: !!selectedPatientId,
    refetchInterval: activeSession ? 5000 : 30000,
  });

  // Load initial chart data
  useEffect(() => {
    if (monitorData?.readings?.length && !activeSession) {
      const readings = [...monitorData.readings].reverse().slice(-50);
      const initial = readings.map((r: MonitoringReading) => ({
        time: formatTime(r.createdAt),
        bpm: r.bpm,
        spo2: r.spo2,
      }));
      setChartData(initial);
      setLatestReading(monitorData.readings[0]);
    }
  }, [monitorData, activeSession]);

  // Subscribe socket — semua data live (tanpa filter patientId)
  useEffect(() => {
    if (!selectedPatientId) return;

    const cleanup = on('monitoring:update', (data: unknown) => {
      const payload = data as { type?: string; reading?: MonitoringReading };
      const reading = payload?.reading;
      if (!reading) return;

      setLatestReading(reading);
      setChartData((prev) => {
        const newPoint = {
          time: formatTime(reading.createdAt),
          bpm: reading.bpm,
          spo2: reading.spo2,
        };
        const updated = [...prev, newPoint];
        return updated.slice(-120); // Keep last 120 points (6 menit @ 3 detik)
      });

      queryClient.invalidateQueries({ queryKey: ['monitoring', 'patient', selectedPatientId] });
    });

    return cleanup;
  }, [on, queryClient, selectedPatientId]);

  const patientOptions = patients.map((p) => ({
    value: String(p.id),
    label: `${p.patientId || `P-${String(p.id).padStart(3, '0')}`} — ${p.name}`,
  }));

  const selectedPatient = patients.find((p) => String(p.id) === selectedPatientId);

  const handlePatientChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedPatientId(newId);
    if (!activeSession) {
      setChartData([]);
      setLatestReading(null);
    }
  }, [activeSession]);

  // BPM color
  const bpmColor = (bpm: number) => bpm < 60 || bpm > 100 ? 'text-danger-500' : 'text-success-500';
  const spo2Color = (spo2: number) => spo2 < 95 ? 'text-danger-500' : 'text-blue-500';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Monitoring Real-time</h1>
        <p className="text-sm text-slate-400 mt-1">
          Pilih responden, mulai sesi monitoring, dan lihat data BPM & SpO₂ langsung
        </p>
      </div>

      {/* Patient Selector + Start/Stop */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <Select
              label="Pilih Responden"
              placeholder="— Pilih responden —"
              options={patientOptions}
              value={selectedPatientId}
              onChange={handlePatientChange}
              disabled={!!activeSession}
            />
          </div>

          <div className="flex items-center gap-3">
            {/* Session Timer */}
            {activeSession && (
              <div className="text-center px-4 py-2 bg-success-50 rounded-xl">
                <p className="text-xs text-slate-500">Sesi Berjalan</p>
                <p className="text-lg font-bold text-success-600 font-mono">{elapsed}</p>
              </div>
            )}

            {/* Start Button */}
            {!activeSession && selectedPatientId && (
              <Button
                onClick={handleStartSession}
                isLoading={sessionLoading}
                className="bg-success-500 hover:bg-success-600 text-white px-6"
              >
                🎬 Mulai Monitoring
              </Button>
            )}

            {/* Stop Button */}
            {activeSession && (
              <Button
                onClick={handleStopSession}
                isLoading={sessionLoading}
                variant="danger"
                className="px-6"
              >
                ⏹ Selesai Monitoring
              </Button>
            )}
          </div>
        </div>

        {loadingPatients && (
          <p className="mt-2 text-sm text-slate-400">Memuat data responden...</p>
        )}
        {patientsError && (
          <p className="mt-2 text-sm text-danger-500">Gagal memuat daftar responden.</p>
        )}
      </Card>

      {/* Active Session Banner */}
      {activeSession && (
        <div className="bg-success-50 border border-success-200 rounded-xl px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-success-700">
              🔴 Sesi Monitoring Sedang Berlangsung
            </p>
            <p className="text-xs text-success-600 mt-0.5">
              Data dari ESP32 akan otomatis tercatat ke responden ini
            </p>
          </div>
          <span className="text-xs text-success-600 font-mono bg-white px-2 py-1 rounded">
            {activeSession.patient?.name || `Responden #${activeSession.patientId}`}
          </span>
        </div>
      )}

      {/* No patient selected */}
      {!selectedPatientId && (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
            </svg>
            <p className="text-lg font-medium">Pilih Responden untuk Memulai</p>
            <p className="text-sm mt-1">Gunakan dropdown di atas untuk memilih responden</p>
          </div>
        </Card>
      )}

      {/* Patient Monitoring Area */}
      {selectedPatientId && (
        <>
          {selectedPatient && (
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{selectedPatient.name}</h2>
                  <p className="text-sm text-slate-400">
                    ID: {selectedPatient.patientId}
                    {selectedPatient.gender ? ` | ${selectedPatient.gender === 'L' ? 'Laki-laki' : 'Perempuan'}` : ''}
                  </p>
                </div>
                {latestReading && <StatusBadge bpm={latestReading.bpm} spo2={latestReading.spo2} status={latestReading.status} size="md" />}
              </div>

              {latestReading && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                  <div className="text-center p-4 rounded-xl bg-danger-50">
                    <p className="text-xs text-slate-500 mb-1">BPM</p>
                    <p className={`text-3xl font-bold ${bpmColor(latestReading.bpm)}`}>
                      {latestReading.bpm}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">detak/menit</p>
                  </div>
                  <div className="text-center p-4 rounded-xl bg-blue-50">
                    <p className="text-xs text-slate-500 mb-1">SpO₂</p>
                    <p className={`text-3xl font-bold ${spo2Color(latestReading.spo2)}`}>
                      {latestReading.spo2}%
                    </p>
                    <p className="text-xs text-slate-400 mt-1">saturasi oksigen</p>
                  </div>
                  <div className="text-center p-4 rounded-xl bg-gray-50">
                    <p className="text-xs text-slate-500 mb-1">Status Klasifikasi</p>
                    <StatusBadge bpm={latestReading.bpm} spo2={latestReading.spo2} status={latestReading.status} />
                  </div>
                  <div className="text-center p-4 rounded-xl bg-gray-50">
                    <p className="text-xs text-slate-500 mb-1">Update</p>
                    <p className="text-lg font-semibold text-slate-700">
                      {formatTime(latestReading.createdAt)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">real-time</p>
                  </div>
                </div>
              )}

              {!latestReading && activeSession && (
                <div className="py-8 text-center text-slate-400">
                  <p className="text-sm">Menunggu data dari sensor...</p>
                  <p className="text-xs mt-1">Tempelkan jari ke sensor MAX30100</p>
                </div>
              )}
            </Card>
          )}

          {loadingMonitor && chartData.length === 0 && !activeSession && (
            <Card><LoadingSpinner size="lg" className="py-10" /></Card>
          )}

          {monitorError && <ErrorState message="Gagal memuat data monitoring" />}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700">❤ BPM Real-time</h3>
                <span className="text-xs text-slate-400">
                  {chartData.length} data point
                </span>
              </div>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94A3B8" interval="preserveStartEnd" />
                    <YAxis domain={[30, 180]} tick={{ fontSize: 11 }} stroke="#94A3B8" />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '13px' }} />
                    <ReferenceLine y={60} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: '60', fontSize: 10, position: 'right' }} />
                    <ReferenceLine y={100} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: '100', fontSize: 10, position: 'right' }} />
                    <Line type="monotone" dataKey="bpm" stroke="#EF4444" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-sm text-slate-400">
                  {activeSession ? 'Tempelkan jari ke sensor...' : 'Mulai sesi monitoring untuk melihat data'}
                </div>
              )}
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700">💧 SpO₂ Real-time</h3>
              </div>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94A3B8" interval="preserveStartEnd" />
                    <YAxis domain={[85, 100]} tick={{ fontSize: 11 }} stroke="#94A3B8" />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '13px' }} />
                    <ReferenceLine y={95} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: '95%', fontSize: 10, position: 'right' }} />
                    <Line type="monotone" dataKey="spo2" stroke="#2563EB" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-sm text-slate-400">
                  {activeSession ? 'Tempelkan jari ke sensor...' : 'Mulai sesi monitoring untuk melihat data'}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {/* ── Completed Sessions ── */}
      <CompletedSessions />

      {/* ── Modal Hasil Sesi ── */}
      <Modal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
        title="✅ Sesi Monitoring Selesai"
        size="md"
      >
        {sessionResult && (
          <div className="space-y-4">
            <div className="text-center pb-2">
              <p className="text-lg font-bold text-slate-900">
                {sessionResult.patient?.name || `Responden #${sessionResult.patientId}`}
              </p>
              <p className="text-sm text-slate-400">
                ID: {sessionResult.patient?.patientId || '-'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-success-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500">Mulai</p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatDate(sessionResult.startTime)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500">Selesai</p>
                <p className="text-sm font-semibold text-slate-800">
                  {sessionResult.endTime ? formatDate(sessionResult.endTime) : '-'}
                </p>
              </div>
              <div className="bg-primary-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500">Total Data</p>
                <p className="text-2xl font-bold text-primary-600">
                  {sessionResult._count?.readings || 0}
                </p>
                <p className="text-xs text-slate-400">records</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500">Device</p>
                <p className="text-sm font-semibold text-slate-800 font-mono">
                  {sessionResult.deviceId || '-'}
                </p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <p className="text-sm text-amber-700">
                📊 Data tersimpan dan bisa dilihat di halaman <strong>Riwayat</strong> dan <strong>Laporan</strong>
              </p>
            </div>

            <div className="flex justify-center pt-2">
              <Button onClick={() => setShowResultModal(false)}>
                Tutup
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Component: Daftar Sesi Monitoring Tersimpan ─────────────────────────
function CompletedSessions() {
  const { data, isLoading } = useQuery({
    queryKey: ['monitoring', 'sessions', 'completed'],
    queryFn: () => monitoringService.getSessions({ status: 'COMPLETED', limit: 10 }),
    refetchInterval: 15000,
  });

  const sessions = data?.items || [];

  if (sessions.length === 0 && !isLoading) return null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">
          📋 Sesi Monitoring Tersimpan
        </h3>
        {isLoading && <LoadingSpinner size="sm" />}
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">
          Belum ada sesi monitoring yang selesai
        </p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">
                  {s.patient?.name || `Responden #${s.patientId}`}
                </p>
                <p className="text-xs text-slate-400">
                  {formatDate(s.startTime)}
                  {s.endTime ? ` — ${formatDate(s.endTime)}` : ''}
                  {s.deviceId ? ` · ${s.deviceId}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-primary-600">
                  {s._count?.readings || 0}
                </p>
                <p className="text-xs text-slate-400">data</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
