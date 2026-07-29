import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useCreatePatient, useUpdatePatient } from '@/hooks/usePatients';
import { BLOOD_TYPES, GENDER_OPTIONS } from '@/constants';
import type { Patient, PatientFormData } from '@/types';

const patientSchema = z.object({
  patientId: z.string().optional(),
  name: z.string().min(1, 'Nama wajib diisi').max(100, 'Nama maksimal 100 karakter'),
  nik: z.string().min(1, 'NIK wajib diisi').regex(/^\d{16}$/, 'NIK harus 16 digit angka'),
  gender: z.enum(['L', 'P'], { required_error: 'Gender wajib dipilih' }),
  birthDate: z.string().min(1, 'Tanggal lahir wajib diisi'),
  address: z.string().min(1, 'Alamat wajib diisi'),
  phone: z.string().min(1, 'No. telepon wajib diisi').regex(/^(\+62|62|0)[0-9]{8,13}$/, 'Format no. telepon tidak valid'),
  bloodType: z.string().min(1, 'Golongan darah wajib dipilih'),
  height: z.coerce.number().min(1, 'Tinggi badan wajib diisi').positive('Tinggi badan harus positif'),
  weight: z.coerce.number().min(1, 'Berat badan wajib diisi').positive('Berat badan harus positif'),
  medicalHistory: z.string().optional(),
  doctorNote: z.string().optional(),
});

interface PatientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient?: Patient;
}

export function PatientFormModal({ isOpen, onClose, patient }: PatientFormModalProps) {
  const isEdit = !!patient;
  const createMutation = useCreatePatient();
  const updateMutation = useUpdatePatient(patient?.id || '');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
  });

  // Reset form when patient data changes (edit mode) or on open (create mode)
  useEffect(() => {
    if (isOpen) {
      if (patient) {
        reset({
          patientId: patient.patientId,
          name: patient.name,
          nik: patient.nik,
          gender: patient.gender,
          birthDate: patient.birthDate ? patient.birthDate.split('T')[0] : '',
          address: patient.address,
          phone: patient.phone,
          bloodType: patient.bloodType,
          height: patient.height,
          weight: patient.weight,
          medicalHistory: patient.medicalHistory || '',
          doctorNote: patient.doctorNote || '',
        });
      } else {
        reset({
          patientId: '',
          name: '',
          nik: '',
          gender: undefined,
          birthDate: '',
          address: '',
          phone: '',
          bloodType: '',
          height: undefined,
          weight: undefined,
          medicalHistory: '',
          doctorNote: '',
        });
      }
    }
  }, [isOpen, patient, reset]);

  const onSubmit = async (data: PatientFormData) => {
    if (isEdit && patient) {
      await updateMutation.mutateAsync(data);
    } else {
      await createMutation.mutateAsync(data);
    }
    onClose();
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Pasien' : 'Tambah Pasien Baru'} size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input
            label="ID Pasien (opsional)"
            placeholder="Otomatis jika dikosongkan"
            error={errors.patientId?.message}
            {...register('patientId')}
          />
          <Input
            label="Nama Lengkap"
            placeholder="Masukkan nama lengkap"
            error={errors.name?.message}
            {...register('name')}
          />
          <Input
            label="NIK"
            placeholder="16 digit NIK"
            maxLength={16}
            error={errors.nik?.message}
            {...register('nik')}
          />
          <Select
            label="Gender"
            options={GENDER_OPTIONS.map(g => ({ value: g.value, label: g.label }))}
            placeholder="Pilih gender"
            error={errors.gender?.message}
            {...register('gender')}
          />
          <Input
            label="Tanggal Lahir"
            type="date"
            error={errors.birthDate?.message}
            {...register('birthDate')}
          />
          <Input
            label="No. Telepon"
            placeholder="08xxxxxxxxxx"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <Select
            label="Golongan Darah"
            options={BLOOD_TYPES.map(b => ({ value: b.value, label: b.label }))}
            placeholder="Pilih golongan darah"
            error={errors.bloodType?.message}
            {...register('bloodType')}
          />
          <Input
            label="Tinggi Badan (cm)"
            type="number"
            placeholder="170"
            error={errors.height?.message}
            {...register('height', { valueAsNumber: true })}
          />
          <Input
            label="Berat Badan (kg)"
            type="number"
            placeholder="65"
            error={errors.weight?.message}
            {...register('weight', { valueAsNumber: true })}
          />
        </div>

        <Input
          label="Alamat"
          placeholder="Masukkan alamat lengkap"
          error={errors.address?.message}
          {...register('address')}
        />

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Riwayat Medis</label>
          <textarea
            className="input-field min-h-[80px] resize-y"
            placeholder="Riwayat medis pasien (opsional)"
            {...register('medicalHistory')}
          />
          {errors.medicalHistory && (
            <p className="text-sm text-danger-500 mt-1">{errors.medicalHistory.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Catatan Dokter</label>
          <textarea
            className="input-field min-h-[80px] resize-y"
            placeholder="Catatan dokter (opsional)"
            {...register('doctorNote')}
          />
          {errors.doctorNote && (
            <p className="text-sm text-danger-500 mt-1">{errors.doctorNote.message}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isLoading={isPending || isSubmitting}>
            {isEdit ? 'Simpan Perubahan' : 'Simpan'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
