import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useNovels, type ListNovelsOptions } from '@/entities/novel';
import { useAddNovelOverlay } from '@/features/add-novel';
import {
  listReadingHistory,
  useReadingContinuityVersion,
  type ReadingHistoryEntry
} from '@/features/read-chapter';
import { useConnectionStatus } from '@/shared/realtime';
import { useDebouncedValue } from '@/shared/lib';

export const LIBRARY_PAGE_SIZE = 12;
export type LibrarySearchScope = 'novels' | 'content';
export type LibrarySort = 'reading' | 'recent' | 'created' | 'title' | 'chapters';
export type LibraryFilter = 'all' | 'reading' | 'unread' | 'completed' | 'importing' | 'failed';

const sortValues = new Set<LibrarySort>(['reading', 'recent', 'created', 'title', 'chapters']);
const filterValues = new Set<LibraryFilter>([
  'all',
  'reading',
  'unread',
  'completed',
  'importing',
  'failed'
]);

function positiveInteger(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function serverStatus(filter: LibraryFilter): ListNovelsOptions['status'] {
  if (filter === 'completed' || filter === 'failed' || filter === 'importing') return filter;
  return 'all';
}

function serverSort(sort: LibrarySort): ListNovelsOptions['sort'] {
  return sort === 'reading' ? 'recent' : sort;
}

export function useLibraryPage() {
  const [urlSearchParams, setSearchParams] = useSearchParams();
  const connectionState = useConnectionStatus();
  const navigate = useNavigate();
  const addNovel = useAddNovelOverlay();
  const keyword = urlSearchParams.get('q') ?? '';
  const scope: LibrarySearchScope =
    urlSearchParams.get('scope') === 'content' ? 'content' : 'novels';
  const rawSort = urlSearchParams.get('sort') as LibrarySort | null;
  const rawFilter = urlSearchParams.get('filter') as LibraryFilter | null;
  const sort = rawSort && sortValues.has(rawSort) ? rawSort : 'reading';
  const filter = rawFilter && filterValues.has(rawFilter) ? rawFilter : 'all';
  const page = positiveInteger(urlSearchParams.get('page'));
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300);
  const continuityVersion = useReadingContinuityVersion();
  const historyEntries = useMemo(() => {
    void continuityVersion;
    return listReadingHistory();
  }, [continuityVersion]);
  const historyByNovel = useMemo(
    () => new Map(historyEntries.map((entry) => [entry.novelId, entry])),
    [historyEntries]
  );
  const readingIds = useMemo(() => historyEntries.map((entry) => entry.novelId), [historyEntries]);
  const offset = (page - 1) * LIBRARY_PAGE_SIZE;
  const options = useMemo<ListNovelsOptions>(
    () => ({
      q: debouncedKeyword || undefined,
      status: serverStatus(filter),
      sort: serverSort(sort),
      limit: LIBRARY_PAGE_SIZE,
      offset,
      ids: filter === 'reading' ? readingIds : undefined,
      excludeIds: filter === 'unread' ? readingIds : undefined,
      readingOrder: sort === 'reading' ? readingIds : undefined
    }),
    [debouncedKeyword, filter, offset, readingIds, sort]
  );
  const novels = useNovels(options, {
    enabled: scope === 'novels',
    connectionState,
    pollingIntervalMs: 15_000,
    refetchOnWindowFocus: false
  });
  const items = novels.data?.items ?? [];
  const total = novels.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
  const primaryEntry = historyEntries[0];
  const primaryNovel = items.find((novel) => novel.id === primaryEntry?.novelId);

  const commitSearchParams = (mutate: (searchParams: URLSearchParams) => void) => {
    setSearchParams(
      (current) => {
        const searchParams = new URLSearchParams(current);
        mutate(searchParams);
        return searchParams;
      },
      { replace: true }
    );
  };

  const setKeyword = (value: string) =>
    commitSearchParams((searchParams) => {
      value ? searchParams.set('q', value) : searchParams.delete('q');
      searchParams.delete('page');
    });
  const setScope = (value: LibrarySearchScope) =>
    commitSearchParams((searchParams) => {
      value === 'content' ? searchParams.set('scope', value) : searchParams.delete('scope');
      searchParams.delete('page');
    });
  const setSort = (value: LibrarySort) =>
    commitSearchParams((searchParams) => {
      value === 'reading' ? searchParams.delete('sort') : searchParams.set('sort', value);
      searchParams.delete('page');
    });
  const setFilter = (value: LibraryFilter) =>
    commitSearchParams((searchParams) => {
      value === 'all' ? searchParams.delete('filter') : searchParams.set('filter', value);
      searchParams.delete('page');
    });
  const setPage = (value: number) =>
    commitSearchParams((searchParams) => {
      const nextPage = Math.max(1, value);
      nextPage === 1 ? searchParams.delete('page') : searchParams.set('page', String(nextPage));
    });

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const readingHistory: Array<{ entry: ReadingHistoryEntry; novel: (typeof items)[number] }> =
    primaryEntry && primaryNovel ? [{ entry: primaryEntry, novel: primaryNovel }] : [];

  return {
    keyword,
    setKeyword,
    scope,
    setScope,
    sort,
    setSort,
    filter,
    setFilter,
    page,
    setPage,
    novels,
    items,
    total,
    totalPages,
    readingHistory,
    readingByNovel: historyByNovel,
    activeControlCount: Number(filter !== 'all') + Number(sort !== 'reading'),
    clearFilters: () =>
      commitSearchParams((searchParams) => {
        searchParams.delete('filter');
        searchParams.delete('sort');
        searchParams.delete('page');
      }),
    retryLoad: () => novels.refetch(),
    openImport: addNovel.open,
    openNovel: (novelId: string) => navigate(`/library/${encodeURIComponent(novelId)}`),
    continueImport: (novelId: string) => navigate(`/library/${encodeURIComponent(novelId)}`),
    continueNovel: (novelId: string, chapterIndex: number) =>
      navigate(`/library/${encodeURIComponent(novelId)}/read/${chapterIndex}`),
    openSearchResult: (item: { novelId: string; chapterIndex?: number }) =>
      navigate(
        item.chapterIndex === undefined
          ? `/library/${encodeURIComponent(item.novelId)}`
          : `/library/${encodeURIComponent(item.novelId)}/read/${item.chapterIndex}`
      )
  };
}
