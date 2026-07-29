import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { settingsService } from '@/services/settings.service';
import { toast } from 'sonner';

const profileSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi'),
  email: z.string().email('Format email tidak valid'),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Password saat ini wajib diisi'),
  newPassword: z.string().min(6, 'Password baru minimal 6 karakter'),
  confirmPassword: z.string().min(1, 'Konfirmasi password wajib diisi'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Konfirmasi password tidak cocok',
  path: ['confirmPassword'],
});

const thresholdSchema = z.object({
  minBpm: z.coerce.number().min(30, 'Min BPM minimal 30').max(200, 'Min BPM maksimal 200'),
  maxBpm: z.coerce.number().min(30, 'Max BPM minimal 30').max(250, 'Max BPM maksimal 250'),
  minSpo2: z.coerce.number().min(50, 'Min SpO₂ minimal 50').max(100, 'Min SpO₂ maksimal 100'),
  maxSpo2: z.coerce.number().min(50, 'Max SpO₂ minimal 50').max(100, 'Max SpO₂ maksimal 100'),
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;
type ThresholdForm = z.infer<typeof thresholdSchema>;

export default function Settings() {
  const [settings, setSettings] = useState<{
    adminName: string;
    adminEmail: string;
    minBpm: number;
    maxBpm: number;
    minSpo2: number;
    maxSpo2: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearResult, setClearResult] = useState<{ deletedReadings: number; deletedSessions: number; deletedAuditLogs: number; keptDevices: number; keptAdmins: number } | null>(null);

  const profileForm = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });
  const passwordForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });
  const thresholdForm = useForm<ThresholdForm>({ resolver: zodResolver(thresholdSchema) });

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await settingsService.getSettings();
      setSettings(result);
      profileForm.reset({ name: result.adminName, email: result.adminEmail });
      thresholdForm.reset({
        minBpm: result.minBpm,
        maxBpm: result.maxBpm,
        minSpo2: result.minSpo2,
        maxSpo2: result.maxSpo2,
      });
    } catch {
      setError('Gagal memuat pengaturan');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleProfileSubmit = async (data: ProfileForm) => {
    try {
      const result = await settingsService.updateProfile(data);
      setSettings((prev) => prev ? { ...prev, adminName: result.adminName, adminEmail: result.adminEmail } : prev);
      toast.success('Profil berhasil diperbarui');
    } catch {
      toast.error('Gagal memperbarui profil');
    }
  };

  const handlePasswordSubmit = async (data: PasswordForm) => {
    try {
      await settingsService.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      });
      toast.success('Password berhasil diubah');
      passwordForm.reset();
    } catch {
      toast.error('Gagal mengubah password. Periksa password saat ini.');
    }
  };

  const handleClearData = async () => {
    setIsClearing(true);
    try {
      const result = await settingsService.clearData();
      setClearResult(result);
      toast.success(`Berhasil menghapus ${result.deletedReadings} data monitoring`);
    } catch {
      toast.error('Gagal menghapus data');
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };

  const handleThresholdSubmit = async (data: ThresholdForm) => {
    try {
      const result = await settingsService.updateThresholds(data);
      setSettings((prev) => prev ? {
        ...prev,
        minBpm: result.minBpm,
        maxBpm: result.maxBpm,
        minSpo2: result.minSpo2,
        maxSpo2: result.maxSpo2,
      } : prev);
      toast.success('Threshold berhasil diperbarui');
    } catch {
      toast.error('Gagal memperbarui threshold');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={fetchSettings} />;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Pengaturan</h1>
        <p className="text-sm text-slate-400 mt-1">Kelola pengaturan aplikasi</p>
      </div>

      {/* Profil Admin */}
      <Card>
        <h2 className="text-base font-semibold text-slate-800 mb-1">Profil Admin</h2>
        <p className="text-sm text-slate-400 mb-5">Informasi profil administrator</p>
        <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nama Admin"
              error={profileForm.formState.errors.name?.message}
              {...profileForm.register('name')}
            />
            <Input
              label="Email"
              type="email"
              error={profileForm.formState.errors.email?.message}
              {...profileForm.register('email')}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" isLoading={profileForm.formState.isSubmitting}>
              Simpan Profil
            </Button>
          </div>
        </form>
      </Card>

      {/* Ubah Password */}
      <Card>
        <h2 className="text-base font-semibold text-slate-800 mb-1">Ubah Password</h2>
        <p className="text-sm text-slate-400 mb-5">Perbarui password akun Anda</p>
        <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Password Saat Ini"
              type="password"
              placeholder="Masukkan password saat ini"
              error={passwordForm.formState.errors.currentPassword?.message}
              {...passwordForm.register('currentPassword')}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Password Baru"
              type="password"
              placeholder="Minimal 6 karakter"
              error={passwordForm.formState.errors.newPassword?.message}
              {...passwordForm.register('newPassword')}
            />
            <Input
              label="Konfirmasi Password Baru"
              type="password"
              placeholder="Ulangi password baru"
              error={passwordForm.formState.errors.confirmPassword?.message}
              {...passwordForm.register('confirmPassword')}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" isLoading={passwordForm.formState.isSubmitting}>
              Ubah Password
            </Button>
          </div>
        </form>
      </Card>

      {/* Threshold BPM & SpO₂ */}
      <Card>
        <h2 className="text-base font-semibold text-slate-800 mb-1">Threshold BPM & SpO₂</h2>
        <p className="text-sm text-slate-400 mb-5">Atur batas ambang BPM dan SpO₂</p>
        <form onSubmit={thresholdForm.handleSubmit(handleThresholdSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Min BPM"
              type="number"
              placeholder="60"
              error={thresholdForm.formState.errors.minBpm?.message}
              {...thresholdForm.register('minBpm')}
            />
            <Input
              label="Max BPM"
              type="number"
              placeholder="100"
              error={thresholdForm.formState.errors.maxBpm?.message}
              {...thresholdForm.register('maxBpm')}
            />
            <Input
              label="Min SpO₂"
              type="number"
              placeholder="95"
              error={thresholdForm.formState.errors.minSpo2?.message}
              {...thresholdForm.register('minSpo2')}
            />
            <Input
              label="Max SpO₂"
              type="number"
              placeholder="100"
              error={thresholdForm.formState.errors.maxSpo2?.message}
              {...thresholdForm.register('maxSpo2')}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" isLoading={thresholdForm.formState.isSubmitting}>
              Simpan Threshold
            </Button>
          </div>
        </form>
      </Card>

      {/* Hapus Semua Data Monitoring */}
      <Card>
        <h2 className="text-base font-semibold text-slate-800 mb-1">🗑️ Hapus Semua Data Monitoring</h2>
        <p className="text-sm text-slate-400 mb-5">Hapus seluruh data readings, sesi monitoring, dan log audit.</p>
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-medium text-danger-700">⚠️ Tindakan ini tidak bisa dibatalkan!</p>
          <p className="text-xs text-danger-600 mt-1">Device (ESP32) dan akun Admin TIDAK akan dihapus.</p>
        </div>

        {clearResult && (
          <div className="bg-success-50 border border-success-200 rounded-xl p-4 mb-4">
            <p className="text-sm font-semibold text-success-700">✅ Data berhasil dihapus!</p>
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-success-600">
              <span>Readings: {clearResult.deletedReadings}</span>
              <span>Sesi: {clearResult.deletedSessions}</span>
              <span>Audit Log: {clearResult.deletedAuditLogs}</span>
              <span>Device aman: {clearResult.keptDevices}</span>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            variant="danger"
            onClick={() => setShowClearConfirm(true)}
            disabled={isClearing}
            isLoading={isClearing}
          >
            Hapus Semua Data
          </Button>
        </div>
      </Card>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearData}
        title="Hapus Semua Data Monitoring?"
        message="Semua data readings, sesi monitoring, dan log audit akan dihapus permanen. Data device ESP32 dan akun Admin tetap aman."
        confirmLabel="Ya, Hapus Semua"
        variant="danger"
        isLoading={isClearing}
      />
    </div>
  );
}
