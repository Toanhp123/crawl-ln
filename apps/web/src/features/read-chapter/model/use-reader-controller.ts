import {
  createReaderSession,
  MemoryReaderChapterCache,
  type ReaderChapterIdentity,
  type ReaderSessionSnapshot
} from '@novel-tool/reader-engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Chapter } from '../../../entities/chapter';
import { chapterLoaderAdapter } from '../lib/chapter-loader-adapter';
import { IndexedDbReaderChapterCache } from '../lib/indexeddb-reader-cache';
import { isReaderUrlOnlySync } from '../lib/reader-route-sync';

const memoryCache = new MemoryReaderChapterCache<Chapter>(8);
const persistentCache = new IndexedDbReaderChapterCache();

export type ReaderChapterSummary = Pick<Chapter, 'id' | 'index' | 'status' | 'contentVersion'>;

export interface ReaderControllerOptions {
  novelId: string;
  initialIndex: number;
  chapters: readonly ReaderChapterSummary[];
  enabled?: boolean;
  onActiveIndexChange?: (index: number) => void;
  onNavigate?: (index: number) => void;
}

function initialSnapshot(activeIndex: number): ReaderSessionSnapshot<Chapter> {
  return {
    chapters: [],
    activeIndex,
    loading: 'initial',
    error: null,
    hasPrevious: false,
    hasNext: false
  };
}

export function useReaderController({
  novelId,
  initialIndex,
  chapters,
  enabled = true,
  onActiveIndexChange,
  onNavigate
}: ReaderControllerOptions) {
  const identitySignature = chapters
    .filter((chapter) => chapter.status === 'fetched')
    .map((chapter) => `${chapter.id}:${chapter.index}:${chapter.contentVersion}`)
    .sort()
    .join('|');
  const identities = useMemo<readonly ReaderChapterIdentity[]>(
    () =>
      chapters
        .filter((chapter) => chapter.status === 'fetched')
        .map(({ id, index, contentVersion }) => ({ id, index, contentVersion }))
        .sort((left, right) => left.index - right.index),
    [identitySignature]
  );
  const session = useMemo(
    () =>
      createReaderSession<Chapter>({
        loader: chapterLoaderAdapter,
        cache: memoryCache,
        persistentCache
      }),
    []
  );
  const [snapshot, setSnapshot] = useState<ReaderSessionSnapshot<Chapter>>(() =>
    initialSnapshot(initialIndex)
  );
  const [offline, setOffline] = useState(() =>
    typeof navigator === 'undefined' ? false : !navigator.onLine
  );
  const activeCallback = useRef(onActiveIndexChange);
  const navigateCallback = useRef(onNavigate);
  const lastReportedIndex = useRef<number | null>(null);
  const snapshotRef = useRef(snapshot);
  const startedSessionRef = useRef<{
    novelId: string;
    initialIndex: number;
    identitySignature: string;
  } | null>(null);
  snapshotRef.current = snapshot;

  useEffect(() => {
    activeCallback.current = onActiveIndexChange;
  }, [onActiveIndexChange]);
  useEffect(() => {
    navigateCallback.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => session.subscribe(setSnapshot), [session]);
  useEffect(() => {
    startedSessionRef.current = null;
  }, [session]);
  useEffect(() => () => session.cancel(), [session]);

  useEffect(() => {
    if (!enabled || !novelId || !Number.isInteger(initialIndex)) {
      session.cancel();
      startedSessionRef.current = null;
      setSnapshot(initialSnapshot(initialIndex));
      return;
    }
    const startedSession = startedSessionRef.current;
    if (startedSession?.novelId === novelId) {
      const sameRouteSession = startedSession.initialIndex === initialIndex;
      const urlCaughtUpWithSession = isReaderUrlOnlySync(snapshotRef.current, initialIndex);
      if (sameRouteSession || urlCaughtUpWithSession) {
        if (startedSession.identitySignature !== identitySignature) {
          session.updateIdentities(identities);
        }
        startedSessionRef.current = { novelId, initialIndex, identitySignature };
        return;
      }
    }
    lastReportedIndex.current = null;
    startedSessionRef.current = { novelId, initialIndex, identitySignature };
    void session.start(novelId, identities, initialIndex).catch(() => undefined);
  }, [enabled, identitySignature, identities, initialIndex, novelId, session]);

  useEffect(() => {
    if (!snapshot.chapters.length || lastReportedIndex.current === snapshot.activeIndex) return;
    lastReportedIndex.current = snapshot.activeIndex;
    activeCallback.current?.(snapshot.activeIndex);
  }, [snapshot.activeIndex, snapshot.chapters.length]);

  useEffect(() => {
    const online = () => setOffline(false);
    const offlineHandler = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offlineHandler);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offlineHandler);
    };
  }, []);

  const activePosition = identities.findIndex(
    (identity) => identity.index === snapshot.activeIndex
  );
  const previous = activePosition > 0 ? identities[activePosition - 1] : null;
  const next = activePosition >= 0 ? (identities[activePosition + 1] ?? null) : null;
  const navigateTo = useCallback((index: number) => navigateCallback.current?.(index), []);

  return {
    ...snapshot,
    offline,
    loadingInitial: snapshot.loading === 'initial',
    loadingPrevious: snapshot.loading === 'previous',
    loadingNext: snapshot.loading === 'next',
    previous,
    next,
    setActiveIndex: useCallback((index: number) => session.setActiveIndex(index), [session]),
    loadPrevious: useCallback(() => session.loadPrevious(), [session]),
    loadNext: useCallback(() => session.loadNext(), [session]),
    retry: useCallback(() => session.retry(), [session]),
    cancel: useCallback(() => session.cancel(), [session]),
    navigateTo,
    navigatePrevious: useCallback(() => {
      if (previous) navigateTo(previous.index);
    }, [navigateTo, previous]),
    navigateNext: useCallback(() => {
      if (next) navigateTo(next.index);
    }, [navigateTo, next])
  };
}
