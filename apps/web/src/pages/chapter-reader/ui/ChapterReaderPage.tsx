import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ChapterReader } from '@/entities/chapter/ui/ChapterReader';
import { ReaderPreferencesSheet } from '@/features/reader-preferences/ui/ReaderPreferencesSheet';
import { ChapterListSheet } from '@/features/select-chapter/ui/ChapterListSheet';
import {
  readReadingPosition,
  saveReadingPosition
} from '@/features/read-chapter/model/readingPositionStorage';
import {
  isBookmarked,
  toggleBookmark
} from '@/features/read-chapter/model/readingContinuityStorage';
import {
  captureReadingAnchor,
  restoreReadingAnchor
} from '@/features/read-chapter/model/readingAnchor';
import { useReaderProgress } from '@/features/read-chapter/model/useReaderProgress';
import { useSwipeChapterNavigation } from '@/features/read-chapter/model/useSwipeChapterNavigation';
import { ReaderToolbar } from '@/widgets/reader-toolbar/ui/ReaderToolbar';
import { ReaderProgress } from '@/widgets/reader-progress/ui/ReaderProgress';
import { ReaderBottomBar } from '@/widgets/reader-bottom-bar/ui/ReaderBottomBar';
import { ReaderOfflineBanner } from '@/features/read-chapter/ui/ReaderOfflineBanner';
import {
  ErrorBanner,
  ErrorState,
  LoadingState,
  Spinner,
  toast,
  useScrollViewport
} from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { useTheme } from '@/shared/theme/runtime/ThemeProvider';
import { cn } from '@/shared/lib/cn';
import { useInfiniteReader } from '@/modules/reader';
import { useChapterReaderPage } from '../model/useChapterReaderPage';
import { useReaderWakeLock } from '../model/useReaderWakeLock';

export function ChapterReaderPage() {
  const { t, number } = useI18n();
  const { reader } = useTheme();
  const params = useParams<{ novelId: string; chapterIndex: string }>();
  const novelId = params.novelId ? decodeURIComponent(params.novelId) : '';
  const parsed = Number(params.chapterIndex);
  const initialIndex = Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  const model = useChapterReaderPage(novelId);
  const { openChapter, openOverview } = model;
  const chapterList = model.detail.data?.chapters ?? [];
  const stream = useInfiniteReader(novelId, initialIndex ?? 0, chapterList);
  const [chrome, setChrome] = useState(true);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const chromeTimer = useRef(0);
  const restored = useRef(false);
  const currentAnchor = useRef({ paragraphId: '', paragraphOffset: 0, scrollRatio: 0 });
  const lastScrollY = useRef(0);
  const allowPreviousLoad = useRef(false);
  const allowNextLoad = useRef(true);
  const readerSession = useRef(0);
  const scrollPhase = useRef<'initializing' | 'restoring' | 'interactive' | 'leaving'>(
    'initializing'
  );
  const scrollViewport = useScrollViewport();
  const readerRoot = useRef<HTMLElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
  const activePosition = chapterList.findIndex((item) => item.index === stream.activeIndex);
  const activeChapter = chapterList[activePosition];
  const readingProgress = useReaderProgress(
    activeChapter?.index ?? null,
    activePosition,
    chapterList.length,
    scrollViewport,
    readerRoot
  );
  const readingProgressRef = useRef(readingProgress);
  useReaderWakeLock(initialIndex !== null && reader.keepAwake);

  useEffect(() => {
    readingProgressRef.current = readingProgress;
  }, [readingProgress]);

  useEffect(() => {
    if (
      initialIndex === null ||
      stream.activeIndex === initialIndex ||
      scrollPhase.current !== 'interactive'
    )
      return;
    const timer = window.setTimeout(() => {
      if (scrollPhase.current === 'interactive') openChapter(stream.activeIndex, true);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [initialIndex, openChapter, stream.activeIndex]);

  const scheduleChromeHide = useCallback(() => {
    window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => {
      if (!chaptersOpen && !prefsOpen) setChrome(false);
    }, 2200);
  }, [chaptersOpen, prefsOpen]);

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

  useEffect(() => {
    if (chrome) scheduleChromeHide();
    return () => window.clearTimeout(chromeTimer.current);
  }, [chrome, scheduleChromeHide]);

  const openPrevious = () => {
    if (stream.previous) openChapter(stream.previous.index);
  };
  const openNext = () => {
    if (stream.next) openChapter(stream.next.index);
  };
  useSwipeChapterNavigation({
    enabled: initialIndex !== null && !chaptersOpen && !prefsOpen,
    onPrevious: openPrevious,
    onNext: openNext
  });

  useEffect(() => {
    const top = topSentinel.current;
    const bottom = bottomSentinel.current;
    if (!top || !bottom) return;
    const viewport = scrollViewport.current;
    if (!viewport) return;
    const topObserver = new IntersectionObserver(
      (entries) => {
        if (scrollPhase.current !== 'interactive' || !allowPreviousLoad.current) return;
        if (
          !entries.some((entry) => entry.isIntersecting) ||
          !stream.hasPrevious ||
          stream.loadingPrevious
        )
          return;
        allowPreviousLoad.current = false;
        const currentSession = readerSession.current;
        const before = viewport.scrollHeight;
        void stream.loadPrevious().then((loaded) => {
          if (
            !loaded ||
            readerSession.current !== currentSession ||
            scrollPhase.current !== 'interactive'
          )
            return;
          requestAnimationFrame(() => {
            if (readerSession.current !== currentSession || scrollPhase.current !== 'interactive')
              return;
            viewport.scrollBy({
              top: viewport.scrollHeight - before,
              behavior: 'auto'
            });
          });
        });
      },
      { root: viewport, rootMargin: '500px 0px 0px' }
    );
    const bottomObserver = new IntersectionObserver(
      (entries) => {
        if (
          scrollPhase.current === 'interactive' &&
          allowNextLoad.current &&
          entries.some((entry) => entry.isIntersecting) &&
          stream.hasNext &&
          !stream.loadingNext
        ) {
          allowNextLoad.current = false;
          void stream.loadNext();
        }
      },
      { root: viewport, rootMargin: '0px 0px 900px' }
    );
    topObserver.observe(top);
    bottomObserver.observe(bottom);
    return () => {
      topObserver.disconnect();
      bottomObserver.disconnect();
    };
  }, [
    stream.hasPrevious,
    stream.hasNext,
    stream.loadingPrevious,
    stream.loadingNext,
    stream.loadPrevious,
    stream.loadNext,
    scrollViewport
  ]);

  useEffect(() => {
    let frame = 0;
    const updateActive = () => {
      frame = 0;
      if (scrollPhase.current !== 'interactive') return;
      const viewport = scrollViewport.current;
      if (!viewport) return;
      const viewportRect = viewport.getBoundingClientRect();
      const probe = viewportRect.top + viewport.clientHeight * 0.32;
      const sections = Array.from(
        readerRoot.current?.querySelectorAll<HTMLElement>('[data-reader-chapter]') ?? []
      );
      const active =
        sections.find((section) => {
          const rect = section.getBoundingClientRect();
          return rect.top <= probe && rect.bottom > probe;
        }) ??
        sections.find((section) => section.getBoundingClientRect().bottom > probe) ??
        sections.at(-1);
      const index = Number(active?.dataset.readerChapter);
      if (Number.isInteger(index) && index !== stream.activeIndex) stream.setActiveIndex(index);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(updateActive);
    };
    const viewport = scrollViewport.current;
    if (!viewport) return;
    viewport.addEventListener('scroll', onScroll, { passive: true });
    updateActive();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport.removeEventListener('scroll', onScroll);
    };
  }, [stream.chapters, stream.activeIndex, stream.setActiveIndex, scrollViewport]);

  const persistCurrentPosition = useCallback(() => {
    if (
      initialIndex === null ||
      scrollPhase.current !== 'interactive' ||
      !activeChapter?.id ||
      activePosition < 0
    )
      return;
    const viewport = scrollViewport.current;
    if (!viewport) return;
    const chapterRoot =
      readerRoot.current?.querySelector<HTMLElement>(`#reader-chapter-${activeChapter.index}`) ??
      readerRoot.current ??
      viewport;
    const anchor = captureReadingAnchor(viewport, chapterRoot);
    const currentProgress = readingProgressRef.current;
    const position = {
      version: 3 as const,
      novelId,
      chapterId: activeChapter.id,
      chapterIndex: stream.activeIndex,
      chapterPosition: activePosition,
      chapterCount: chapterList.length,
      bookProgress: currentProgress.overallRatio,
      ...anchor,
      scrollRatio: currentProgress.chapterRatio,
      updatedAt: new Date().toISOString()
    };
    currentAnchor.current = position;
    saveReadingPosition(position);
  }, [
    novelId,
    initialIndex,
    stream.activeIndex,
    activeChapter?.id,
    activeChapter?.index,
    activePosition,
    chapterList.length,
    scrollViewport
  ]);

  useEffect(() => {
    if (initialIndex === null) return;
    const viewport = scrollViewport.current;
    if (!viewport) return;
    let saveTimer = 0;
    const onScroll = () => {
      const currentY = viewport.scrollTop;
      const delta = currentY - lastScrollY.current;
      if (scrollPhase.current !== 'interactive') {
        lastScrollY.current = currentY;
        return;
      }
      if (delta < -10) allowPreviousLoad.current = true;
      if (delta > 10) allowNextLoad.current = true;
      if (Math.abs(delta) > 10) setChrome(delta < 0 || currentY < 72);
      lastScrollY.current = currentY;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(persistCurrentPosition, 220);
    };
    lastScrollY.current = viewport.scrollTop;
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(saveTimer);
      persistCurrentPosition();
      viewport.removeEventListener('scroll', onScroll);
    };
  }, [initialIndex, persistCurrentPosition, scrollViewport]);

  useEffect(() => {
    const isUrlOnlySync =
      stream.chapters.length > 0 &&
      stream.activeIndex === initialIndex &&
      stream.chapters.some((chapter) => chapter.index === initialIndex);
    if (isUrlOnlySync) return;
    readerSession.current += 1;
    restored.current = false;
    allowPreviousLoad.current = false;
    allowNextLoad.current = true;
    scrollPhase.current = 'initializing';
    scrollViewport.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [novelId, initialIndex, scrollViewport]);

  useEffect(() => {
    return () => {
      scrollPhase.current = 'leaving';
      readerSession.current += 1;
      stream.cancelSession();
      window.clearTimeout(chromeTimer.current);
    };
  }, [stream.cancelSession]);
  const initialChapterLoaded =
    initialIndex !== null && stream.chapters.some((item) => item.index === initialIndex);

  useLayoutEffect(() => {
    if (initialIndex === null || !initialChapterLoaded || restored.current) return;
    const viewport = scrollViewport.current;
    const chapterRoot = readerRoot.current?.querySelector<HTMLElement>(
      `#reader-chapter-${initialIndex}`
    );
    if (!viewport || !chapterRoot) return;

    scrollPhase.current = 'restoring';
    const initialChapter = chapterList.find((item) => item.index === initialIndex);
    const saved = initialChapter ? readReadingPosition(novelId, initialChapter) : null;
    if (saved) {
      currentAnchor.current = {
        paragraphId: saved.paragraphId,
        paragraphOffset: saved.paragraphOffset,
        scrollRatio: saved.scrollRatio
      };
      restoreReadingAnchor(saved, viewport, chapterRoot);
    } else {
      const viewportRect = viewport.getBoundingClientRect();
      viewport.scrollTo({
        top: Math.max(
          0,
          viewport.scrollTop + chapterRoot.getBoundingClientRect().top - viewportRect.top
        ),
        behavior: 'auto'
      });
    }
    restored.current = true;
    lastScrollY.current = viewport.scrollTop;
    scrollPhase.current = 'interactive';
  }, [initialChapterLoaded, chapterList, novelId, initialIndex, scrollViewport]);

  const activeLoadedChapter = stream.chapters.find((item) => item.id === activeChapter?.id);
  const readingStats = useMemo(() => {
    const text = activeLoadedChapter?.cleanText ?? activeLoadedChapter?.rawText ?? '';
    const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
    return { words, minutes: Math.max(1, Math.ceil(words / 220)) };
  }, [activeLoadedChapter]);

  if (!params.novelId) return <Navigate to="/library" replace />;
  if (initialIndex === null)
    return <Navigate to={`/library/${encodeURIComponent(novelId)}`} replace />;

  const position = Math.max(0, activePosition + 1);
  const progress = readingProgress.overallPercent;
  const viewport = scrollViewport.current;
  const anchor =
    currentAnchor.current.paragraphId || !viewport
      ? currentAnchor.current
      : captureReadingAnchor(
          viewport,
          readerRoot.current?.querySelector<HTMLElement>(
            `#reader-chapter-${activeChapter?.index ?? stream.activeIndex}`
          ) ??
            readerRoot.current ??
            viewport
        );
  const bookmarked = activeChapter
    ? isBookmarked(novelId, activeChapter.id, anchor.paragraphId)
    : false;

  const toggleCurrentBookmark = () => {
    const viewport = scrollViewport.current;
    if (!viewport) return;
    const nextAnchor = captureReadingAnchor(
      viewport,
      readerRoot.current?.querySelector<HTMLElement>(
        `#reader-chapter-${activeChapter?.index ?? stream.activeIndex}`
      ) ??
        readerRoot.current ??
        viewport
    );
    currentAnchor.current = nextAnchor;
    const saved = toggleBookmark({
      novelId,
      chapterId: activeChapter?.id ?? '',
      chapterIndex: stream.activeIndex,
      paragraphId: nextAnchor.paragraphId,
      paragraphOffset: nextAnchor.paragraphOffset
    });
    toast({
      kind: 'success',
      title: saved ? t('reader.bookmarkSaved') : t('reader.bookmarkRemoved')
    });
  };

  return (
    <article
      ref={readerRoot}
      id="reader-content"
      data-reader-theme={reader.colorScheme}
      className="reader-surface min-h-full bg-bg text-text"
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('button, a, [role=dialog]')) return;
        setChrome((value) => {
          const next = !value;
          if (next) scheduleChromeHide();
          return next;
        });
      }}
    >
      <ReaderOfflineBanner offline={offline} />
      <div
        className={cn(
          'fixed inset-x-0 top-0 z-[var(--z-nav)] transition-transform duration-[var(--motion-normal)]',
          chrome ? 'translate-y-0' : '-translate-y-full'
        )}
      >
        <ReaderToolbar
          title={model.detail.data?.novel.title ?? t('reader.loading')}
          progress={progress}
          chapterPosition={position}
          chapterCount={chapterList.length}
          bookmarked={bookmarked}
          onBack={() => {
            persistCurrentPosition();
            scrollPhase.current = 'leaving';
            stream.cancelSession();
            openOverview();
          }}
          onBookmark={toggleCurrentBookmark}
          onChapters={() => setChaptersOpen(true)}
          onPreferences={() => setPrefsOpen(true)}
        />
        <ReaderProgress value={progress} />
      </div>
      <div className="mx-auto max-w-[var(--reader-content-max)] px-[var(--reader-page-x)] pb-36 pt-24">
        {model.error && <ErrorBanner error={model.error} />}
        {Boolean(stream.error) && !stream.loadingInitial && stream.chapters.length === 0 && (
          <ErrorState
            title={t('reader.loadFailed')}
            description={offline ? t('reader.offlineMissing') : t('reader.loadFailedDescription')}
            actionLabel={t('common.retry')}
            onAction={stream.retry}
          />
        )}
        <div ref={topSentinel} aria-hidden className="h-px" />
        {stream.loadingPrevious && (
          <div className="flex items-center justify-center gap-2 py-5 type-body-sm text-muted">
            <Spinner />
            <span>{t('reader.loadingPrevious')}</span>
          </div>
        )}
        {stream.loadingInitial ? (
          <LoadingState title={t('reader.loading')} />
        ) : (
          stream.chapters.map((chapter) => (
            <section
              key={chapter.id}
              className="motion-reader-enter border-b border-border/70 py-8 last:border-b-0"
            >
              <ChapterReader chapter={chapter} />
              {chapter.id === activeChapter?.id && (
                <div className="mt-8 flex items-center justify-center gap-3 type-caption font-semibold text-muted">
                  <span>{t('reader.wordCount', { count: number(readingStats.words) })}</span>
                  <span aria-hidden>·</span>
                  <span>{t('reader.minutes', { count: number(readingStats.minutes) })}</span>
                </div>
              )}
            </section>
          ))
        )}
        {stream.loadingNext && (
          <div className="flex items-center justify-center gap-2 py-8 type-body-sm text-muted">
            <Spinner />
            <span>{t('reader.loadingNext')}</span>
          </div>
        )}
        {!stream.hasNext && stream.chapters.length > 0 && (
          <p className="py-10 text-center type-body-sm font-medium text-muted">
            {t('reader.endOfBook')}
          </p>
        )}
        <div ref={bottomSentinel} aria-hidden className="h-px" />
        <p className="mt-10 text-center type-caption text-muted">{t('reader.tapHint')}</p>
      </div>
      <nav
        className={cn(
          'fixed inset-x-0 bottom-0 z-[var(--z-nav)] border-t border-border bg-[hsl(var(--color-bg-elevated)/.96)] px-3 pb-[calc(var(--space-3)+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl transition-transform duration-[var(--motion-normal)]',
          chrome ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        <ReaderBottomBar
          chapterTitle={activeChapter?.title ?? t('reader.loading')}
          chapterPosition={position}
          chapterCount={chapterList.length}
          chapterPercent={readingProgress.chapterPercent}
          bookPercent={progress}
          previous={Boolean(stream.previous)}
          next={Boolean(stream.next)}
          onPrevious={openPrevious}
          onNext={openNext}
        />
      </nav>
      <ChapterListSheet
        open={chaptersOpen}
        onOpenChange={setChaptersOpen}
        chapters={chapterList}
        currentIndex={stream.activeIndex}
        onSelect={openChapter}
      />
      <ReaderPreferencesSheet open={prefsOpen} onOpenChange={setPrefsOpen} />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[calc(var(--z-nav)+2)] bg-black opacity-[var(--reader-dim-opacity)]"
      />
    </article>
  );
}
