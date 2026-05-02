import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scanApi } from '../api/books';

export const SCAN_STATUS_KEY = 'scan-status';
export const SCAN_SUMMARY_KEY = 'scan-summary';

export function useScanSummary() {
  return useQuery({
    queryKey: [SCAN_SUMMARY_KEY],
    queryFn: () => scanApi.getScanSummary(),
    refetchInterval: false,
  });
}

export function useScanStatus(taskId: string | null) {
  return useQuery({
    queryKey: [SCAN_STATUS_KEY, taskId],
    queryFn: () => scanApi.getScanStatus(taskId!),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'running' || status === 'pending') {
        return 2000;
      }
      return false;
    },
  });
}

export function useTriggerScanMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (path?: string) => scanApi.triggerScan(path),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [SCAN_SUMMARY_KEY] });
      queryClient.invalidateQueries({ queryKey: [SCAN_STATUS_KEY, data.task_id] });
    },
  });
}
