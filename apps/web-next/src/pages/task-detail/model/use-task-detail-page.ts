import { useNavigate, useParams } from 'react-router-dom';
import { useNovel } from '@/entities/novel';
import { isTaskPolling, useTask, useTaskEvents } from '@/entities/task';
import { useConnectionStatus } from '@/shared/realtime';

export function useTaskDetailPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const connectionState = useConnectionStatus();
  const task = useTask(taskId, {
    connectionState,
    pollingIntervalMs: 10_000,
    refetchOnWindowFocus: false
  });
  const events = useTaskEvents(taskId, {
    connectionState,
    pollingIntervalMs: isTaskPolling(task.data?.status) ? 10_000 : false,
    refetchOnWindowFocus: false
  });
  const novel = useNovel(task.data?.novelId, {
    connectionState,
    pollingIntervalMs: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false
  });
  return { taskId, task, events, novel, connectionState, navigate };
}
