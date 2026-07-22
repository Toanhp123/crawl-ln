import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNovel } from '@/entities/novel';
import { readReaderReturnState } from '@/features/read-chapter';

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
    const state = readReaderReturnState(location.state);
    navigate(state?.readerReturnPath ?? `/library/${encodeURIComponent(novelId)}`, {
      replace: true,
      state: state?.backgroundScrollKey
        ? { backgroundScrollKey: state.backgroundScrollKey }
        : undefined
    });
  }, [location.state, navigate, novelId]);
  return { detail, error: detail.error, openChapter, openOverview };
}
