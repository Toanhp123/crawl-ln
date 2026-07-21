import { useQuery } from '@tanstack/react-query';
import { getChapter } from './chapter-api';
import { chapterKeys } from './chapter-keys';

export type ChapterQueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
};

export function useChapter(
  novelId: string | null | undefined,
  index: number | null | undefined,
  options: ChapterQueryOptions = {}
) {
  const enabled =
    Boolean(novelId) && index !== null && index !== undefined && (options.enabled ?? true);
  return useQuery({
    queryKey: chapterKeys.detail(novelId ?? '', index ?? -1),
    queryFn: ({ signal }) => getChapter(novelId!, index!, signal),
    enabled,
    staleTime: options.staleTime ?? 5 * 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}
