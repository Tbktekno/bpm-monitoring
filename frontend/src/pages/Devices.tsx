// =============================================================================
// Devices Page — ESP32/ESP8266 Device Management
// =============================================================================

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  IoHardwareChipOutline,
  IoAddOutline,
  IoCopyOutline,
  IoCheckmarkCircleOutline,
  IoCloseCircleOutline,
  IoTrashOutline,
  IoReloadOutline,
  IoInformationCircleOutline,
} from 'react-icons/io5';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { devicesService } from '@/services/devices.service';
import { usePagination } from '@/hooks/usePagination';
import type { EspDevice, EspDeviceWithKey } from '@/types';
import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy HH:mm', { locale: id });
  } catch {
    return dateStr;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Devices() {
  const queryClient = useQueryClient();
  const { page, goToPage, totalPages, resetPage, paginationParams } = usePagination();
  const [search, setSearch] = useState('');

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editDevice, setEditDevice] = useState<EspDevice | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [newDeviceKey, setNewDeviceKey] = useState<string | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['devices', paginationParams, search],
    queryFn: () => devicesService.list({ ...paginationParams, search }),
  });

  const devices = data?.items || [];
  const paginationInfo = data?.pagination;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (form: { deviceId: string; label: string }) =>
      devicesService.create(form),
    onSuccess: (result: EspDeviceWithKey) => {
      setNewDeviceKey(result.rawApiKey || null);
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success('Device berhasil didaftarkan!');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Gagal mendaftarkan device');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data: form }: { id: number; data: { deviceId: string; label: string } }) =>
      devicesService.update(id, form),
    onSuccess: () => {
      setEditDevice(null);
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success('Device berhasil diupdate');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Gagal mengupdate device');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => devicesService.toggle(id),
    onSuccess: (device: EspDevice) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success(`Device ${device.isActive ? 'diaktifkan' : 'dinonaktifkan'}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Gagal mengubah status');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => devicesService.remove(id),
    onSuccess: () => {
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast.success('Device berhasil dihapus');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Gagal menghapus device');
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSearch = (value: string) => {
    setSearch(value);
    resetPage();
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      deviceId: formData.get('deviceId') as string,
      label: formData.get('label') as string,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editDevice) return;
    const formData = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: editDevice.id,
      data: {
        deviceId: formData.get('deviceId') as string,
        label: formData.get('label') as string,
      },
    });
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('API Key disalin ke clipboard');
    } catch {
      toast.error('Gagal menyalin');
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800">Device Management</h1>
        </div>
        <ErrorState message="Gagal memuat data device" onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Device Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Kelola perangkat ESP32 / ESP8266 yang terdaftar
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <IoAddOutline className="w-4 h-4" />
          Tambah Device
        </Button>
      </div>

      {/* Info card */}
      <Card className="bg-primary-50 border border-primary-100 p-4">
        <div className="flex items-start gap-3">
          <IoInformationCircleOutline className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-primary-800">
            <p className="font-medium mb-1">Cara mendaftarkan device:</p>
            <ol className="list-decimal list-inside space-y-1 text-primary-700">
              <li>Klik <strong>Tambah Device</strong> — isi Device ID dan Label</li>
              <li>System akan <strong>generate API Key</strong> secara otomatis</li>
              <li><strong>Salin API Key sekarang!</strong> Hanya ditampilkan sekali</li>
              <li>Masukkan API Key tersebut ke firmware ESP8266</li>
              <li>Device siap digunakan — BPM &amp; SpO₂ akan masuk ke dashboard</li>
            </ol>
          </div>
        </div>
      </Card>

      {/* Search */}
      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={handleSearch}
          placeholder="Cari device ID atau label..."
        />
        <Button variant="ghost" onClick={() => refetch()}>
          <IoReloadOutline className="w-4 h-4" />
        </Button>
      </div>

      {/* Device List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : devices.length === 0 ? (
        <EmptyState
          icon={<IoHardwareChipOutline className="w-12 h-12" />}
          title="Belum ada device terdaftar"
          description={search ? 'Tidak ada device yang cocok dengan pencarian' : 'Klik "Tambah Device" untuk mendaftarkan perangkat pertama'}
          action={
            !search ? (
              <Button onClick={() => setShowCreateModal(true)}>
                <IoAddOutline className="w-4 h-4" />
                Tambah Device
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-3">
            {devices.map((device) => (
              <Card key={device.id} className="hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between p-2">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      device.isActive
                        ? 'bg-success-50 text-success-600'
                        : 'bg-slate-100 text-slate-400'
                    }`}>
                      <IoHardwareChipOutline className="w-5 h-5" />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-slate-800">
                          {device.deviceId}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          device.isActive
                            ? 'bg-success-50 text-success-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {device.isActive ? (
                            <><IoCheckmarkCircleOutline className="w-3 h-3" /> Aktif</>
                          ) : (
                            <><IoCloseCircleOutline className="w-3 h-3" /> Nonaktif</>
                          )}
                        </span>
                      </div>
                      {device.label && (
                        <p className="text-sm text-slate-500 mt-0.5">{device.label}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        Dibuat {formatDate(device.createdAt)}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <Button
                      variant="ghost"
                      onClick={() => toggleMutation.mutate(device.id)}
                      disabled={toggleMutation.isPending}
                      className={device.isActive ? 'text-warning-600 hover:bg-warning-50' : 'text-success-600 hover:bg-success-50'}
                    >
                      {device.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setEditDevice(device)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setDeleteId(device.id)}
                      className="text-danger-500 hover:text-danger-600"
                    >
                      <IoTrashOutline className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {paginationInfo && paginationInfo.totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={paginationInfo.totalPages}
              onPageChange={goToPage}
            />
          )}
        </>
      )}

      {/* ── CREATE MODAL ──────────────────────────────────────────────────── */}
      <Modal
        isOpen={showCreateModal && !newDeviceKey}
        onClose={() => setShowCreateModal(false)}
        title="Tambah Device Baru"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Device ID"
            name="deviceId"
            placeholder="contoh: ESP8266-RUANG-1"
            required
            minLength={3}
            maxLength={50}
            helperText="ID unik untuk perangkat. Gunakan nama yang mudah dikenali."
          />
          <Input
            label="Label / Lokasi (opsional)"
            name="label"
            placeholder="contoh: Ruang Observasi 1"
            maxLength={100}
            helperText="Misalnya nama ruangan atau lokasi device."
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowCreateModal(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── API KEY SUCCESS MODAL ─────────────────────────────────────────── */}
      <Modal
        isOpen={!!newDeviceKey}
        onClose={() => { setNewDeviceKey(null); setShowCreateModal(false); }}
        title="✅ Device Berhasil Didaftarkan!"
      >
        <div className="space-y-4">
          <div className="bg-warning-50 border border-warning-200 rounded-lg p-4">
            <p className="text-sm font-medium text-warning-800 mb-1">
              ⚠ Salin API Key ini sekarang!
            </p>
            <p className="text-xs text-warning-700">
              API Key hanya ditampilkan <strong>sekali ini saja</strong>.
              Jika hilang, Anda harus daftarkan ulang device.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">API Key</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 block bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 font-mono text-sm text-slate-800 break-all select-all">
                {newDeviceKey}
              </code>
              <Button
                variant="ghost"
                onClick={() => copyToClipboard(newDeviceKey!)}
                className="flex-shrink-0"
              >
                <IoCopyOutline className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500 font-medium mb-1">Cara pakai:</p>
            <ol className="text-xs text-slate-500 space-y-0.5 list-decimal list-inside">
              <li>Salin API Key di atas</li>
              <li>Buka firmware ESP8266, edit bagian konfigurasi</li>
              <li>Isi <code className="bg-slate-200 px-1 rounded text-xs">DEFAULT_API_KEY</code> dengan key ini</li>
              <li>Upload ulang firmware ke ESP8266</li>
              <li>Device siap mengirim data!</li>
            </ol>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => { setNewDeviceKey(null); setShowCreateModal(false); }}>
              Selesai
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── EDIT MODAL ────────────────────────────────────────────────────── */}
      <Modal
        isOpen={!!editDevice}
        onClose={() => setEditDevice(null)}
        title={`Edit Device: ${editDevice?.deviceId || ''}`}
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          <Input
            label="Device ID"
            name="deviceId"
            defaultValue={editDevice?.deviceId || ''}
            required
            minLength={3}
            maxLength={50}
          />
          <Input
            label="Label / Lokasi"
            name="label"
            defaultValue={editDevice?.label || ''}
            maxLength={100}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditDevice(null)}>
              Batal
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── DELETE CONFIRM ────────────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId!)}
        title="Hapus Device?"
        message={`Yakin ingin menghapus device ini? Data tidak bisa dikembalikan.`}
        confirmLabel="Hapus"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
