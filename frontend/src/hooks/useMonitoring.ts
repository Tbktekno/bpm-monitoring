import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { monitoringService, type MonitoringParams } from '@/services/monitoring.service';
import { useSocket } from './useSocket';

export function useMonitoring(params?: MonitoringParams) {
  const queryClient = useQueryClient();
  const { on } = useSocket();

  useEffect(() => {
    const cleanup = on('monitoring:update', () => {
      queryClient.invalidateQueries({ queryKey: ['monitoring'] });
    });
    return cleanup;
  }, [on, queryClient]);

  return useQuery({
    queryKey: ['monitoring', params],
    queryFn: () => monitoringService.getRealtime(params),
    refetchInterval: 10000,
  });
}

export function useMonitoringByPatient(patientId: string, params?: { page?: number; limit?: number }) {
  const queryClient = useQueryClient();
  const { on } = useSocket();

  useEffect(() => {
    const cleanup = on('monitoring:update', (data: unknown) => {
      const update = data as { patientId?: string };
      if (update?.patientId === patientId) {
        queryClient.invalidateQueries({ queryKey: ['monitoring', 'patient', patientId] });
      }
    });
    return cleanup;
  }, [on, queryClient, patientId]);

  return useQuery({
    queryKey: ['monitoring', 'patient', patientId, params],
    queryFn: () => monitoringService.getByPatient(patientId, params),
    enabled: !!patientId,
    refetchInterval: 10000,
  });
}

export function useMonitoringHistory(params?: MonitoringParams) {
  const queryClient = useQueryClient();
  const { on } = useSocket();

  useEffect(() => {
    const cleanup = on('monitoring:update', () => {
      queryClient.invalidateQueries({ queryKey: ['monitoring', 'history'] });
    });
    return cleanup;
  }, [on, queryClient]);

  return useQuery({
    queryKey: ['monitoring', 'history', params],
    queryFn: () => monitoringService.getHistory(params),
  });
}
