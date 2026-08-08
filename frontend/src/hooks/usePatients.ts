import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { patientsService, type PatientListParams } from '@/services/patients.service';
import type { PatientFormData } from '@/types';

export function usePatients(params?: PatientListParams) {
  return useQuery({
    queryKey: ['patients', params],
    queryFn: () => patientsService.getAll(params),
  });
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientsService.getById(id),
    enabled: !!id,
  });
}

export function useCreatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PatientFormData) => patientsService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      toast.success('Responden berhasil ditambahkan');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Gagal menambahkan responden';
      toast.error(message);
    },
  });
}

export function useUpdatePatient(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<PatientFormData>) => patientsService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
      toast.success('Data responden berhasil diperbarui');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Gagal memperbarui data responden';
      toast.error(message);
    },
  });
}

export function useDeletePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => patientsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      toast.success('Responden berhasil dihapus');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Gagal menghapus responden';
      toast.error(message);
    },
  });
}
