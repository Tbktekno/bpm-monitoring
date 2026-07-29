import { useState, useMemo } from 'react';
import { IoDownloadOutline, IoPulseOutline, IoHeart, IoWaterOutline, IoTimeOutline } from 'react-icons/io5';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { reportsService } from '@/services/reports.service';
import { monitoringService, type SessionData } from '@/services/monitoring.service';
import { patientsService } from '@/services/patients.service';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import type { Patient } from '@/types';

function formatDate(timestamp: string) {
  try { return format(parseISO(timestamp), 'dd MMM yyyy', { locale: id }); }
  catch { return '--'; }
}

function formatTime(timestamp: string) {
  try { return format(parseISO(timestamp), 'HH:mm', { locale: id }); }
  catch { return '--'; }
}

function formatDuration(start: string, end?: string | null): string {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function Reports() {
  const [filterPatient, setFilterPatient] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [selectedSession, setSelectedSession] = useState<SessionData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [sessionDetail, setSessionDetail] = useState<{ readings: any[]; totalReadings: number } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exportingSessionId, setExportingSessionId] = useState<number | null>(null);

  // Fetch patients for filter dropdown
  const { data: patientsData } = useQuery({
    queryKey: ['patients', 'list'],
    queryFn: () => patientsService.getAll({ limit: 100 }),
  });
  const patients: Patient[] = patientsData?.items || [];

  // Fetch completed sessions
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['monitoring', 'sessions', 'completed', filterPatient, filterDate],
    queryFn: () => monitoringService.getSessions({
      status: 'COMPLETED',
      limit: 100,
      ...(filterPatient ? { patientId: Number(filterPatient) } : {}),
    }),
  });
  const sessions = sessionsData?.items || [];

  // Filter by date (client-side)
  const filteredSessions = useMemo(() => {
    if (!filterDate) return sessions;
    return sessions.filter((s) => {
      const d = s.startTime?.split('T')[0];
      return d === filterDate;
    });
  }, [sessions, filterDate]);

  // Stats
  const stats = useMemo(() => {
    const totalSessions = filteredSessions.length;
    const totalReadings = filteredSessions.reduce((sum, s) => sum + (s._count?.readings || 0), 0);
    const uniquePatients = new Set(filteredSessions.map((s) => s.patientId)).size;
    return { totalSessions, totalReadings, uniquePatients };
  }, [filteredSessions]);

  // Fetch detail
  const handleSessionClick = async (session: SessionData) => {
    setSelectedSession(session);
    setShowDetailModal(true);
    setDetailLoading(true);
    try {
      const detail = await monitoringService.getSessionDetail(session.id);
      setSessionDetail(detail);
    } catch {
      toast.error('Gagal memuat detail sesi');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExportSessionPdf = async (sessionId: number) => {
    setExportingSessionId(sessionId);
    try {
      const blob = await reportsService.exportSessionPdf(sessionId);
      reportsService.downloadBlob(blob, `sesi-${sessionId}-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF sesi berhasil diunduh');
    } catch {
      toast.error('Gagal mengekspor PDF sesi');
    } finally {
      setExportingSessionId(null);
    }
  };

  // Compute per-session BPM/SpO2 stats from readings
  const computeStats = (readings: any[]) => {
    if (!readings.length) return { avgBpm: 0, avgSpo2: 0, minBpm: 0, maxBpm: 0, minSpo2: 0, maxSpo2: 0 };
    const bpms = readings.map((r) => r.bpm);
    const spo2s = readings.map((r) => r.spo2);
    return {
      avgBpm: Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length),
      avgSpo2: Math.round(spo2s.reduce((a, b) => a + b, 0) / spo2s.length),
      minBpm: Math.min(...bpms),
      maxBpm: Math.max(...bpms),
      minSpo2: Math.min(...spo2s),
      maxSpo2: Math.max(...spo2s),
    };
  };

  const patientOptions = patients.map((p) => ({
    value: String(p.id),
    label: `${p.patientId || `P-${p.id}`} — ${p.name}`,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">📋 Laporan Monitoring</h1>
        <p className="text-sm text-slate-400 mt-1">Data monitoring BPM & SpO₂ per sesi pemeriksaan</p>
      </div>

      {/* Stats Overview */}
      {!sessionsLoading && filteredSessions.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-primary-50 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-primary-600">{stats.totalSessions}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total Sesi</p>
          </div>
          <div className="bg-success-50 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-success-600">{stats.totalReadings}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total Data</p>
          </div>
          <div className="bg-amber-50 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.uniquePatients}</p>
            <p className="text-xs text-slate-500 mt-0.5">Pasien</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Select
              label="Filter Pasien"
              placeholder="Semua Pasien"
              options={patientOptions}
              value={filterPatient}
              onChange={(e) => setFilterPatient(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Filter Tanggal</label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="input-field text-sm w-full"
            />
          </div>
          {(filterPatient || filterDate) && (
            <div className="flex items-end pb-1">
              <Button
                variant="ghost"
                onClick={() => { setFilterPatient(''); setFilterDate(''); }}
              >
                Reset Filter
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Sessions List */}
      {sessionsLoading ? (
        <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>
      ) : filteredSessions.length === 0 ? (
        <Card>
          <div className="py-16 text-center text-slate-400">
            <IoPulseOutline className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">Belum ada sesi monitoring</p>
            <p className="text-sm mt-1">Lakukan monitoring pasien terlebih dahulu</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map((s) => (
            <Card key={s.id}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Left: Patient info + session time */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-bold text-slate-900 truncate">
                      {s.patient?.name || `Pasien #${s.patientId}`}
                    </h3>
                    <StatusBadge status={s.status === 'COMPLETED' ? 'NORMAL' : 'WASPADA'} size="sm" />
                  </div>
                  <p className="text-xs text-slate-400">
                    ID: {s.patient?.patientId || '-'}
                    {s.deviceId ? ` · ${s.deviceId}` : ''}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><IoTimeOutline /> {formatDate(s.startTime)} {formatTime(s.startTime)}</span>
                    <span>→</span>
                    <span>{s.endTime ? formatTime(s.endTime) : '—'}</span>
                    <span className="text-slate-300">|</span>
                    <span className="font-mono text-slate-400">{formatDuration(s.startTime, s.endTime)}</span>
                  </div>
                </div>

                {/* Right: Stats + Actions */}
                <div className="flex items-center gap-4 sm:gap-6">
                  <SessionStat icon={<IoHeart className="text-danger-500" />} label="BPM" value={`${s._count?.readings || 0}`} sub="data" />
                  <div className="hidden sm:flex gap-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSessionClick(s)}
                    >
                      Detail
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<IoDownloadOutline />}
                      onClick={(e) => { e.stopPropagation(); handleExportSessionPdf(s.id); }}
                      isLoading={exportingSessionId === s.id}
                    >
                      PDF
                    </Button>
                  </div>
                  {/* Mobile buttons */}
                  <div className="flex sm:hidden gap-2">
                    <button onClick={() => handleSessionClick(s)} className="text-xs text-primary-500 font-semibold">Detail</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleExportSessionPdf(s.id); }}
                      disabled={exportingSessionId === s.id}
                      className="text-xs text-primary-500 font-semibold"
                    >{exportingSessionId === s.id ? '...' : 'PDF'}</button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Detail Sesi */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setSessionDetail(null); }}
        title={selectedSession ? `🩺 ${selectedSession.patient?.name || ''}` : 'Detail Sesi'}
        size="lg"
      >
        {detailLoading ? (
          <div className="flex justify-center py-10"><LoadingSpinner size="lg" /></div>
        ) : sessionDetail ? (
          <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-1">
            {/* Session header */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-400">Mulai</p>
                <p className="text-sm font-semibold">{formatDate(selectedSession?.startTime || '')}</p>
                <p className="text-xs text-slate-400">{selectedSession ? formatTime(selectedSession.startTime) : ''}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-400">Selesai</p>
                <p className="text-sm font-semibold">{selectedSession?.endTime ? formatDate(selectedSession.endTime) : '-'}</p>
                <p className="text-xs text-slate-400">{selectedSession?.endTime ? formatTime(selectedSession.endTime) : ''}</p>
              </div>
              <div className="bg-primary-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-400">Durasi</p>
                <p className="text-sm font-bold text-primary-600">{formatDuration(selectedSession?.startTime || '', selectedSession?.endTime)}</p>
                <p className="text-xs text-slate-400">{sessionDetail.totalReadings} data</p>
              </div>
            </div>

            {/* Quick stats */}
            {(() => {
              const stats = computeStats(sessionDetail.readings);
              return (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-danger-50 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">❤ BPM</p>
                    <p className="text-lg font-bold text-danger-600">{stats.avgBpm}</p>
                    <p className="text-xs text-slate-400">rata-rata ({stats.minBpm}–{stats.maxBpm})</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">💧 SpO₂</p>
                    <p className="text-lg font-bold text-blue-600">{stats.avgSpo2}%</p>
                    <p className="text-xs text-slate-400">rata-rata ({stats.minSpo2}%–{stats.maxSpo2}%)</p>
                  </div>
                </div>
              );
            })()}

            {/* Readings table */}
            {sessionDetail.readings.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Detail Data</p>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-slate-500">
                        <th className="p-2.5 text-left font-medium">Waktu</th>
                        <th className="p-2.5 text-right font-medium">BPM</th>
                        <th className="p-2.5 text-right font-medium">SpO₂</th>
                        <th className="p-2.5 text-center font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionDetail.readings.map((r: any) => (
                        <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="p-2.5 text-slate-400">{formatTime(r.createdAt)}</td>
                          <td className={`p-2.5 text-right font-semibold ${r.bpm < 60 || r.bpm > 100 ? 'text-danger-500' : 'text-success-500'}`}>{r.bpm}</td>
                          <td className={`p-2.5 text-right font-semibold ${r.spo2 < 95 ? 'text-danger-500' : 'text-blue-500'}`}>{r.spo2}%</td>
                          <td className="p-2.5 text-center"><StatusBadge bpm={r.bpm} spo2={r.spo2} status={r.status} size="sm" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">Tidak ada data</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => handleExportSessionPdf(selectedSession!.id)}>
                <IoDownloadOutline className="w-4 h-4" /> Download PDF
              </Button>
              <Button onClick={() => { setShowDetailModal(false); setSessionDetail(null); }}>Tutup</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function SessionStat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="p-1.5 rounded-lg bg-gray-50">{icon}</div>
      <div className="text-right">
        <p className="text-lg font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-400">{sub}</p>
      </div>
    </div>
  );
}
