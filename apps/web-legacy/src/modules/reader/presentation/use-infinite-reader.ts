import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Chapter } from '@novel-tool/shared';
import { getNovelChapter } from '@/entities/novel/api/novelApi';
import {
  appendReaderChapter,
  createReaderWindow,
  prependReaderChapter
} from '../domain/reader-window';
import {
  MemoryReaderChapterCache,
  ReaderChapterSource
} from '../application/reader-chapter-source';
import { IndexedDbReaderChapterCache } from '../infrastructure/indexeddb-reader-cache';

const WINDOW_LIMIT = 5;
const memoryCache = new MemoryReaderChapterCache(8);
const diskCache = new IndexedDbReaderChapterCache();
const source = new ReaderChapterSource(memoryCache, getNovelChapter, diskCache);

export interface ReaderChapterSummary {
  id: string;
  index: number;
  status: Chapter['status'];
  contentVersion: number;
}

function prefetchChapter(
  novelId: string,
  chapter: ReaderChapterSummary,
  signal: AbortSignal
): void {
  void source.load(novelId, chapter, signal).catch(() => undefined);
}

export function useInfiniteReader(
  novelId: string,
  initialIndex: number,
  chapterList: ReaderChapterSummary[]
) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [retryToken, setRetryToken] = useState(0);
  const session = useRef(0);
  const sessionController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const chaptersRef = useRef<Chapter[]>([]);
  const activeIndexRef = useRef(initialIndex);
  const loadingNextRef = useRef(false);
  const loadingPreviousRef = useRef(false);

  const fetched = useMemo(
    () => chapterList.filter((item) => item.status === 'fetched').sort((a, b) => a.index - b.index),
    [chapterList]
  );
  const initialChapter = useMemo(
    () => fetched.find((item) => item.index === initialIndex),
    [fetched, initialIndex]
  );
  const fetchedRef = useRef(fetched);
  const novelIdRef = useRef(novelId);

  const beginSession = useCallback(() => {
    sessionController.current?.abort();
    sessionController.current = new AbortController();
    session.current += 1;
    return { id: session.current, signal: sessionController.current.signal };
  }, []);

  const abortSession = useCallback(() => {
    sessionController.current?.abort();
    sessionController.current = null;
    session.current += 1;
    loadingNextRef.current = false;
    loadingPreviousRef.current = false;
  }, []);

  useEffect(() => {
    chaptersRef.current = chapters;
  }, [chapters]);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);
  useEffect(() => {
    fetchedRef.current = fetched;
  }, [fetched]);
  useEffect(() => {
    novelIdRef.current = novelId;
  }, [novelId]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortSession();
    };
  }, [abortSession]);

  const adjacent = useCallback((index: number, direction: -1 | 1) => {
    const items = fetchedRef.current;
    const position = items.findIndex((item) => item.index === index);
    return position < 0 ? null : (items[position + direction] ?? null);
  }, []);

  useEffect(() => {
    if (!novelId || !Number.isInteger(initialIndex)) return;
    const isUrlOnlySync =
      chaptersRef.current.length > 0 &&
      activeIndexRef.current === initialIndex &&
      chaptersRef.current.some((chapter) => chapter.index === initialIndex);
    if (isUrlOnlySync) return;
    const currentSession = beginSession();

    chaptersRef.current = [];
    activeIndexRef.current = initialIndex;
    loadingNextRef.current = false;
    loadingPreviousRef.current = false;
    setChapters([]);
    setActiveIndex(initialIndex);
    setLoadingNext(false);
    setLoadingPrevious(false);
    setLoadingInitial(true);
    setError(null);

    if (!initialChapter) {
      setLoadingInitial(false);
      return;
    }

    void source
      .load(novelId, initialChapter, currentSession.signal)
      .then((chapter) => {
        if (!mounted.current || session.current !== currentSession.id) return;
        const nextWindow = createReaderWindow(chapter, initialIndex).chapters;
        chaptersRef.current = nextWindow;
        setChapters(nextWindow);
        setActiveIndex(initialIndex);
        activeIndexRef.current = initialIndex;
        const next = adjacent(initialIndex, 1);
        if (next) prefetchChapter(novelId, next, currentSession.signal);
      })
      .catch((caught) => {
        if (
          mounted.current &&
          session.current === currentSession.id &&
          !(caught instanceof DOMException && caught.name === 'AbortError')
        )
          setError(caught);
      })
      .finally(() => {
        if (mounted.current && session.current === currentSession.id) setLoadingInitial(false);
      });
  }, [
    novelId,
    initialIndex,
    initialChapter?.id,
    initialChapter?.contentVersion,
    adjacent,
    beginSession,
    retryToken
  ]);

  const loadNext = useCallback(async () => {
    if (loadingNextRef.current || !chaptersRef.current.length) return false;
    const currentSession = session.current;
    const signal = sessionController.current?.signal;
    if (!signal || signal.aborted) return false;
    const last = chaptersRef.current.at(-1)!;
    const next = adjacent(last.index, 1);
    if (!next) return false;
    loadingNextRef.current = true;
    setLoadingNext(true);
    try {
      const chapter = await source.load(novelIdRef.current, next, signal);
      if (!mounted.current || session.current !== currentSession) return false;
      const nextWindow = appendReaderChapter(
        { chapters: chaptersRef.current },
        chapter,
        activeIndexRef.current,
        WINDOW_LIMIT
      ).chapters;
      chaptersRef.current = nextWindow;
      setChapters(nextWindow);
      const following = adjacent(next.index, 1);
      if (following) prefetchChapter(novelIdRef.current, following, signal);
      return true;
    } catch (caught) {
      if (
        mounted.current &&
        session.current === currentSession &&
        !(caught instanceof DOMException && caught.name === 'AbortError')
      )
        setError(caught);
      return false;
    } finally {
      if (session.current === currentSession) {
        loadingNextRef.current = false;
        if (mounted.current) setLoadingNext(false);
      }
    }
  }, [adjacent]);

  const loadPrevious = useCallback(async () => {
    if (loadingPreviousRef.current || !chaptersRef.current.length) return false;
    const currentSession = session.current;
    const signal = sessionController.current?.signal;
    if (!signal || signal.aborted) return false;
    const first = chaptersRef.current[0];
    const previous = adjacent(first.index, -1);
    if (!previous) return false;
    loadingPreviousRef.current = true;
    setLoadingPrevious(true);
    try {
      const chapter = await source.load(novelIdRef.current, previous, signal);
      if (!mounted.current || session.current !== currentSession) return false;
      const nextWindow = prependReaderChapter(
        { chapters: chaptersRef.current },
        chapter,
        activeIndexRef.current,
        WINDOW_LIMIT
      ).chapters;
      chaptersRef.current = nextWindow;
      setChapters(nextWindow);
      return true;
    } catch (caught) {
      if (
        mounted.current &&
        session.current === currentSession &&
        !(caught instanceof DOMException && caught.name === 'AbortError')
      )
        setError(caught);
      return false;
    } finally {
      if (session.current === currentSession) {
        loadingPreviousRef.current = false;
        if (mounted.current) setLoadingPrevious(false);
      }
    }
  }, [adjacent]);

  const cancelSession = useCallback(() => {
    abortSession();
    if (mounted.current) {
      setLoadingNext(false);
      setLoadingPrevious(false);
    }
  }, [abortSession]);

  const activePosition = fetched.findIndex((item) => item.index === activeIndex);
  return {
    chapters,
    activeIndex,
    setActiveIndex: (index: number) => {
      activeIndexRef.current = index;
      setActiveIndex(index);
    },
    loadingInitial,
    loadingNext,
    loadingPrevious,
    error,
    retry: () => {
      abortSession();
      setError(null);
      chaptersRef.current = [];
      setChapters([]);
      setRetryToken((value) => value + 1);
    },
    cancelSession,
    loadNext,
    loadPrevious,
    previous: activePosition > 0 ? fetched[activePosition - 1] : null,
    next: activePosition >= 0 ? (fetched[activePosition + 1] ?? null) : null,
    hasPrevious: chapters.length > 0 && Boolean(adjacent(chapters[0].index, -1)),
    hasNext: chapters.length > 0 && Boolean(adjacent(chapters.at(-1)!.index, 1))
  };
}
