import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { getNovel } from '@/entities/novel/api/novelApi';
import { queryKeys } from '@/shared/api/queryKeys';
import { cameFromApp } from '@/shared/navigation/readerReturnState';

export function useChapterReaderPage(novelId: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const detail = useQuery({
    queryKey: queryKeys.novel(novelId),
    queryFn: ({ signal }) => getNovel(novelId, signal),
    refetchInterval: false
  });
  const openChapter = useCallback(
    (index: number, replace = false) =>
      navigate(`/library/${encodeURIComponent(novelId)}/read/${index}`, {
        replace,
        state: location.state
      }),
    [location.state, navigate, novelId]
  );
  const openOverview = useCallback(() => {
    if (cameFromApp(location.state)) {
      navigate(-1);
      return;
    }
    navigate(`/library/${encodeURIComponent(novelId)}`, { replace: true });
  }, [location.state, navigate, novelId]);
  return {
    detail,
    error: detail.error,
    openChapter,
    openOverview
  };
}
