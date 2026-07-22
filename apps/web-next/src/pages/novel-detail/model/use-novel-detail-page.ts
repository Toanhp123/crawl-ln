import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import { useNovel } from '@/entities/novel';
import { useNovelTask } from '@/entities/task';
import { useCrawlNovel } from '@/features/crawl-novel';
import { useDeleteNovel } from '@/features/delete-novel';
import { useUpdateNovel } from '@/features/update-novel';
import { useConnectionStatus } from '@/shared/realtime';

export function useNovelDetailPage(novelId: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const connectionState = useConnectionStatus();
  const readerOpen = Boolean(useMatch('/library/:novelId/read/:chapterIndex'));
  const detail = useNovel(novelId, {
    enabled: Boolean(novelId),
    connectionState,
    pollingIntervalMs: readerOpen ? false : 15_000,
    refetchOnWindowFocus: !readerOpen
  });
  const task = useNovelTask(novelId, {
    enabled: Boolean(novelId) && !readerOpen,
    connectionState,
    pollingIntervalMs: 10_000,
    refetchOnWindowFocus: !readerOpen
  });
  const refreshMutation = useUpdateNovel();
  const importMutation = useCrawlNovel();
  const removeMutation = useDeleteNovel({
    onDeleted: () => navigate('/library', { replace: true })
  });

  return {
    detail,
    task,
    refreshMutation,
    importMutation,
    removeMutation,
    readerOpen,
    error:
      detail.error ||
      task.error ||
      refreshMutation.error ||
      importMutation.error ||
      removeMutation.error,
    openChapter: (index: number) =>
      navigate(`/library/${encodeURIComponent(novelId)}/read/${index}`, {
        state: { readerReturnPath: location.pathname, backgroundScrollKey: location.key }
      }),
    openLibrary: () => navigate('/library')
  };
}
