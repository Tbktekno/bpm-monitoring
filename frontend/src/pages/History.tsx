import { useState } from 'react';
import { IoDocumentTextOutline, IoTabletLandscapeOutline } from 'react-icons/io5';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { DataTable } from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { useMonitoringHistory } from '@/hooks/useMonitoring';
import { usePagination } from '@/hooks/usePagination';
import { reportsService } from '@/services/reports.service';
import { STATUS_FILTERS } from '@/constants';
import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { toast } from 'sonner';
import type { MonitoringReading } from '@/types';

function formatDate(timestamp: string) {
  try {
    return format(parseISO(timestamp), 'dd MMM yyyy', { locale: id });
  } catch {
    return '--';
  }
}

function formatTime(timestamp: string) {
  try {
    return format(parseISO(timestamp), 'HH:mm', { locale: id });
  } catch {
    return '--:--';
  }
}

export default function History() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { page, goToPage, totalPages, resetPage, paginationParams } = usePagination();
  const [isExporting, setIsExporting] = useState<'pdf' | 'excel' | null>(null);

  const { data, isLoading, error, refetch } = useMonitoringHistory({
    ...paginationParams,
    search,
    status: statusFilter || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const readings = data?.readings || [];
  const paginationInfo = data?.pagination;

  const columns: Column<MonitoringReading>[] = [
    { key: 'date', header: 'Tanggal', render: (r) => formatDate(r.createdAt) },
    { key: 'time', header: 'Jam', render: (r) => formatTime(r.createdAt) },
    { key: 'name', header: 'Nama', render: (r) => <span className="font-medium text-slate-800">{r.patient?.name || 'Tidak Diketahui'}</span> },
    { key: 'bpm', header: 'BPM', render: (r) => (
      <span className={`text-sm font-semibold ${r.bpm < 60 || r.bpm > 100 ? 'text-danger-500' : 'text-success-500'}`}>{r.bpm}</span>
    )},
    { key: 'spo2', header: 'SpO₂', render: (r) => (
      <span className={`text-sm font-semibold ${r.spo2 < 95 ? 'text-danger-500' : 'text-blue-500'}`}>{r.spo2}%</span>
    )},
    { key: 'status', header: 'Status', render: (r) => <StatusBadge bpm={r.bpm} spo2={r.spo2} status={r.status} size="sm" /> },
  ];

  const handleSearch = (value: string) => {
    setSearch(value);
    resetPage();
  };

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
    resetPage();
  };

  const handleExportPdf = async () => {
    setIsExporting('pdf');
    try {
      const blob = await reportsService.exportPdf({
        type: 'harian',
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      reportsService.downloadBlob(blob, `riwayat-monitoring-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF berhasil diunduh');
    } catch {
      toast.error('Gagal mengekspor PDF');
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting('excel');
    try {
      const blob = await reportsService.exportExcel({
        type: 'harian',
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      reportsService.downloadBlob(blob, `riwayat-monitoring-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Excel berhasil diunduh');
    } catch {
      toast.error('Gagal mengekspor Excel');
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Riwayat Monitoring</h1>
        <p className="text-sm text-slate-400 mt-1">Riwayat data monitoring BPM & SpO₂</p>
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SearchInput
            value={search}
            onChange={handleSearch}
            placeholder="Cari nama pasien..."
          />
          <Select
            options={STATUS_FILTERS.map(s => ({ value: s.value, label: s.label }))}
            value={statusFilter}
            onChange={(e) => handleStatusFilter(e.target.value)}
          />
          <div className="sm:col-span-2">
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={(d) => { setStartDate(d); resetPage(); }}
              onEndDateChange={(d) => { setEndDate(d); resetPage(); }}
            />
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          icon={<IoDocumentTextOutline />}
          onClick={handleExportPdf}
          isLoading={isExporting === 'pdf'}
        >
          Export PDF
        </Button>
        <Button
          variant="secondary"
          icon={<IoTabletLandscapeOutline />}
          onClick={handleExportExcel}
          isLoading={isExporting === 'excel'}
        >
          Export Excel
        </Button>
      </div>

      {/* Table */}
      <Card padding="none">
        <DataTable
          columns={columns}
          data={readings}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          error={error || null}
          onRetry={() => refetch()}
          emptyMessage="Belum ada data riwayat"
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
    </div>
  );
}
