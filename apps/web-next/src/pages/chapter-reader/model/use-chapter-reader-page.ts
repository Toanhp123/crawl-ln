import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNovel } from '@/entities/novel';

interface ReaderRouteState {
  readerReturnPath?: string;
  backgroundScrollKey?: string;
}

export function useChapterReaderPage(novelId: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const detail = useNovel(novelId, {
    enabled: Boolean(novelId),
    staleTime: 15_000,
    pollingIntervalMs: false,
    refetchOnWindowFocus: false
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
    const returnPath = (location.state as ReaderRouteState | null)?.readerReturnPath;
    const state = location.state as ReaderRouteState | null;
    navigate(returnPath || `/library/${encodeURIComponent(novelId)}`, {
      replace: true,
      state: state?.backgroundScrollKey
        ? { backgroundScrollKey: state.backgroundScrollKey }
        : undefined
    });
  }, [location.state, navigate, novelId]);
  return { detail, error: detail.error, openChapter, openOverview };
}
