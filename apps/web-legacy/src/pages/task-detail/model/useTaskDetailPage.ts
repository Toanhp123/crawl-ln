import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { getNovel } from '@/entities/novel/api/novelApi';
import {
  cancelTask,
  getTask,
  getTaskEvents,
  pauseTask,
  resumeTask
} from '@/entities/task/api/taskApi';
import { queryKeys } from '@/shared/api/queryKeys';
import { isTaskPolling } from '@/entities/task/model/status';
import { getRealtimePollingInterval, useRealtimeStatus } from '@/shared/realtime';
export function useTaskDetailPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const realtimeStatus = useRealtimeStatus();
  const task = useQuery({
    queryKey: queryKeys.task(taskId),
    queryFn: ({ signal }) => getTask(taskId, signal),
    enabled: Boolean(taskId),
    refetchInterval: (q) =>
      getRealtimePollingInterval(realtimeStatus, isTaskPolling(q.state.data?.status), 10_000),
    refetchOnWindowFocus: false
  });
  const events = useQuery({
    queryKey: queryKeys.taskEvents(taskId),
    queryFn: ({ signal }) => getTaskEvents(taskId, signal),
    enabled: Boolean(taskId),
    refetchInterval: () =>
      getRealtimePollingInterval(realtimeStatus, isTaskPolling(task.data?.status), 10_000),
    refetchOnWindowFocus: false
  });
  const novel = useQuery({
    queryKey: queryKeys.novel(task.data?.novelId ?? null),
    queryFn: ({ signal }) => getNovel(task.data!.novelId, signal),
    enabled: Boolean(task.data?.novelId),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false
  });
  const invalidate = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.taskEvents(taskId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks }),
      queryClient.invalidateQueries({ queryKey: queryKeys.taskSummary })
    ]);
  const cancel = useMutation({ mutationFn: () => cancelTask(taskId), onSuccess: invalidate });
  const pause = useMutation({ mutationFn: () => pauseTask(taskId), onSuccess: invalidate });
  const resume = useMutation({ mutationFn: () => resumeTask(taskId), onSuccess: invalidate });
  return { taskId, task, events, novel, cancel, pause, resume, navigate };
}
