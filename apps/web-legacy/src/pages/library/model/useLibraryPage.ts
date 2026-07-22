import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { readerNavigationState } from '@/shared/navigation/readerReturnState';
import { useGlobalAddNovel } from '@/shared/model/GlobalAddNovelContext';
import { listNovels } from '@/entities/novel/api/novelApi';
import type { LibraryFilter, LibrarySort } from '@/features/filter-library';
import { queryKeys } from '@/shared/api/queryKeys';
import { useDebouncedValue } from '@/shared/lib/useDebouncedValue';
import { getRealtimePollingInterval, useRealtimeStatus } from '@/shared/realtime';
import {
  listReadingHistory,
  useReadingContinuityVersion
} from '@/features/read-chapter/model/readingContinuityStorage';

export const LIBRARY_PAGE_SIZE = 12;

function serverStatus(filter: LibraryFilter) {
  if (filter === 'completed' || filter === 'failed' || filter === 'importing') return filter;
  return 'all' as const;
}

function serverSort(sort: LibrarySort) {
  return sort === 'reading' ? ('recent' as const) : sort;
}

export type LibrarySearchScope = 'novels' | 'content';

export function useLibraryPage() {
  const realtimeStatus = useRealtimeStatus();
  const [keyword, setKeyword] = useState('');
  const [searchScope, setSearchScope] = useState<LibrarySearchScope>('novels');
  const [sort, setSort] = useState<LibrarySort>('reading');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [page, setPage] = useState(1);
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
  const options = useMemo(
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
  const novels = useQuery({
    queryKey: queryKeys.novels(options),
    queryFn: ({ signal }) => listNovels(options, signal),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: () =>
      getRealtimePollingInterval(realtimeStatus, searchScope === 'novels', 15_000),
    refetchIntervalInBackground: false,
    enabled: searchScope === 'novels'
  });
  const navigate = useNavigate();
  const addNovel = useGlobalAddNovel();
  const items = novels.data?.items ?? [];
  const primaryEntry = historyEntries[0];
  const primaryNovel = items.find((novel) => novel.id === primaryEntry?.novelId);
  const total = novels.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));

  useEffect(() => setPage(1), [debouncedKeyword, filter, sort, searchScope]);
  useEffect(() => setPage((current) => Math.min(current, totalPages)), [totalPages]);

  const readingHistory =
    primaryEntry && primaryNovel ? [{ entry: primaryEntry, novel: primaryNovel }] : [];
  const activeFilterChips = [
    ...(filter !== 'all' ? [{ id: 'filter' as const, labelKey: `library.filter.${filter}` }] : []),
    ...(sort !== 'reading' ? [{ id: 'sort' as const, labelKey: `library.sort.${sort}` }] : [])
  ];

  return {
    keyword,
    setKeyword,
    searchScope,
    setSearchScope,
    sort,
    setSort,
    filter,
    setFilter,
    novels,
    items,
    visibleItems: items,
    total,
    page,
    setPage,
    totalPages,
    readingHistory,
    readingByNovel: historyByNovel,
    activeFilterChips,
    isSearchEmpty: Boolean(debouncedKeyword) && items.length === 0,
    isFilterEmpty: !debouncedKeyword && filter !== 'all' && items.length === 0,
    clearFilter: () => setFilter('all'),
    clearSort: () => setSort('reading'),
    clearFilters: () => {
      setFilter('all');
      setSort('reading');
    },
    retryLoad: () => novels.refetch(),
    openImport: addNovel.open,
    openNovel: (novelId: string) => navigate(`/library/${encodeURIComponent(novelId)}`),
    continueImport: (novelId: string) => navigate(`/library/${encodeURIComponent(novelId)}`),
    continueNovel: (novelId: string, chapterIndex: number) =>
      navigate(`/library/${encodeURIComponent(novelId)}/read/${chapterIndex}`, {
        state: readerNavigationState()
      })
  };
}
