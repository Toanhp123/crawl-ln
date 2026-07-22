import { useQuery } from '@tanstack/react-query';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import { getNovel } from '@/entities/novel/api/novelApi';
import { getNovelTask } from '@/entities/task';
import { useCrawlNovel } from '@/features/crawl-novel/model/useCrawlNovel';
import { useUpdateNovel } from '@/features/update-novel/model/useUpdateNovel';
import { useDeleteNovel } from '@/features/delete-novel/model/useDeleteNovel';
import { useAutoUpdate } from '@/features/auto-update/model/useAutoUpdate';
import { queryKeys } from '@/shared/api/queryKeys';
import { readerNavigationState } from '@/shared/navigation/readerReturnState';
import { getRealtimePollingInterval, useRealtimeStatus } from '@/shared/realtime';

export function useNovelDetailPage(novelId: string) {
  const navigate = useNavigate();
  const realtimeStatus = useRealtimeStatus();
  const location = useLocation();
  const readerOpen = Boolean(useMatch('/library/:novelId/read/:chapterIndex'));
  const detail = useQuery({
    queryKey: queryKeys.novel(novelId),
    queryFn: ({ signal }) => getNovel(novelId, signal),
    staleTime: 15_000,
    refetchInterval: () => getRealtimePollingInterval(realtimeStatus, !readerOpen, 15_000),
    refetchOnWindowFocus: !readerOpen
  });
  const task = useQuery({
    queryKey: queryKeys.novelTask(novelId),
    queryFn: ({ signal }) => getNovelTask(novelId, signal),
    enabled: !readerOpen,
    refetchInterval: (query) =>
      getRealtimePollingInterval(
        realtimeStatus,
        !readerOpen &&
          ['queued', 'running', 'pausing', 'resuming'].includes(query.state.data?.status ?? ''),
        10_000
      ),
    refetchOnWindowFocus: !readerOpen
  });
  const crawl = useCrawlNovel();
  const updateNovel = useUpdateNovel();
  const removeNovel = useDeleteNovel(() => navigate('/library', { replace: true }));
  const autoUpdate = useAutoUpdate(novelId, !readerOpen);
  return {
    detail,
    task,
    crawl,
    updateNovel,
    removeNovel,
    autoUpdate,
    readerOpen,
    error:
      detail.error ||
      task.error ||
      crawl.error ||
      updateNovel.error ||
      removeNovel.error ||
      autoUpdate.diagnostics.error ||
      autoUpdate.policy.error,
    openChapter: (index: number) =>
      navigate(`/library/${encodeURIComponent(novelId)}/read/${index}`, {
        state: readerNavigationState(location.key)
      }),
    openLibrary: () => navigate('/library')
  };
}
