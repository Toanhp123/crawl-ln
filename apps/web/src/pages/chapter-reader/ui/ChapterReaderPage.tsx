import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ChapterReader } from '@/entities/chapter';
import {
  captureReadingAnchor,
  isBookmarked,
  markChapterRead,
  readChapterIds,
  readReadingPosition,
  recordReadingActivity,
  restoreReadingAnchor,
  saveReadingPosition,
  toggleBookmark,
  useReaderController,
  useReadingContinuityVersion,
  useSwipeChapterNavigation,
  ReaderOfflineBanner,
  type StoredReadingPosition
} from '@/features/read-chapter';
import { ReaderPreferencesSheet, useReaderPreferences } from '@/features/reader-preferences';
import { ChapterListSheet } from '@/features/select-chapter';
import { useI18n } from '@/shared/i18n';
import { cn } from '@/shared/lib';
import {
  ErrorBanner,
  ErrorState,
  LoadingState,
  Spinner,
  toast,
  useScrollViewport
} from '@/shared/ui';
import { ReaderBottomBar } from '@/widgets/reader-bottom-bar';
import { ReaderProgress } from '@/widgets/reader-progress';
import { ReaderToolbar } from '@/widgets/reader-toolbar';
import { useChapterReaderPage } from '../model/use-chapter-reader-page';
import { useReaderScrollCoordinator } from '../model/use-reader-scroll-coordinator';
import { useReaderWakeLock } from '../model/use-reader-wake-lock';

export function ChapterReaderPage() {
  const { t, number } = useI18n();
  const { preferences } = useReaderPreferences();
  const params = useParams<{ novelId: string; chapterIndex: string }>();
  const novelId = params.novelId ? decodeURIComponent(params.novelId) : '';
  const parsed = Number(params.chapterIndex);
  const initialIndex = Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  const model = useChapterReaderPage(novelId);
  const [chrome, setChrome] = useState(true);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const viewportRef = useScrollViewport();
  const readerRoot = useRef<HTMLElement>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
  const chromeTimer = useRef(0);
  const restored = useRef(false);
  const interactive = useRef(false);
  const currentAnchor = useRef({ paragraphId: '', paragraphOffset: 0, scrollRatio: 0 });
  const chapters = model.detail.data?.chapters ?? [];
  const controller = useReaderController({
    novelId,
    initialIndex: initialIndex ?? 0,
    chapters,
    enabled: initialIndex !== null && Boolean(model.detail.data),
    onNavigate: (index) => model.openChapter(index)
  });
  const activePosition = chapters.findIndex((chapter) => chapter.index === controller.activeIndex);
  const activeSummary = chapters[activePosition];
  const activeChapter = controller.chapters.find(
    (chapter) => chapter.index === controller.activeIndex
  );
  const readIds = useMemo(() => readChapterIds(novelId), [novelId, controller.activeIndex]);
  const continuityVersion = useReadingContinuityVersion();
  void continuityVersion;
  useReaderWakeLock(initialIndex !== null && preferences.keepAwake);

  const scheduleChromeHide = useCallback(() => {
    window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => {
      if (!chaptersOpen && !preferencesOpen) setChrome(false);
    }, 2200);
  }, [chaptersOpen, preferencesOpen]);

  useEffect(() => {
    if (chrome) scheduleChromeHide();
    return () => window.clearTimeout(chromeTimer.current);
  }, [chrome, scheduleChromeHide]);

  useSwipeChapterNavigation({
    enabled: initialIndex !== null && !chaptersOpen && !preferencesOpen,
    rootRef: readerRoot,
    onPrevious: controller.navigatePrevious,
    onNext: controller.navigateNext
  });

  const persistCurrentPosition = useCallback(
    (persistIndex = controller.activeIndex, bookProgress = 0) => {
      const viewport = viewportRef.current;
      const summary = chapters.find((chapter) => chapter.index === persistIndex);
      const chapterPosition = chapters.findIndex((chapter) => chapter.index === persistIndex);
      if (!interactive.current || !viewport || !summary || chapterPosition < 0) return;
      const chapterRoot =
        readerRoot.current?.querySelector<HTMLElement>(`#reader-chapter-${summary.index}`) ??
        readerRoot.current ??
        viewport;
      const anchor = captureReadingAnchor(viewport, chapterRoot);
      currentAnchor.current = anchor;
      const storedPosition: StoredReadingPosition = {
        schemaVersion: 1,
        novelId,
        chapterId: summary.id,
        chapterIndex: summary.index,
        chapterPosition,
        chapterCount: chapters.length,
        bookProgress,
        ...anchor,
        updatedAt: new Date().toISOString()
      };
      saveReadingPosition(storedPosition);
      recordReadingActivity(storedPosition);
      markChapterRead(novelId, summary.id);
    },
    [chapters, novelId, viewportRef, controller.activeIndex]
  );

  const progress = useReaderScrollCoordinator({
    novelId,
    chapterCount: chapters.length,
    chapterPosition: (index) => chapters.findIndex((chapter) => chapter.index === index),
    activeIndex: controller.activeIndex,
    loadedChapters: controller.chapters,
    hasPrevious: controller.hasPrevious,
    hasNext: controller.hasNext,
    loadingPrevious: controller.loadingPrevious,
    loadingNext: controller.loadingNext,
    chromeVisible: chrome,
    setActiveIndex: controller.setActiveIndex,
    loadPrevious: controller.loadPrevious,
    loadNext: controller.loadNext,
    viewportRef,
    readerRootRef: readerRoot,
    topSentinelRef: topSentinel,
    bottomSentinelRef: bottomSentinel,
    interactiveRef: interactive,
    onChromeChange: setChrome,
    onPersist: persistCurrentPosition
  });
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    if (initialIndex === null) return;
    restored.current = false;
    interactive.current = false;
    viewportRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [initialIndex, novelId, viewportRef]);

  const initialLoaded =
    initialIndex !== null && controller.chapters.some((chapter) => chapter.index === initialIndex);
  useLayoutEffect(() => {
    if (!initialLoaded || restored.current || initialIndex === null) return;
    const viewport = viewportRef.current;
    const chapterRoot = readerRoot.current?.querySelector<HTMLElement>(
      `#reader-chapter-${initialIndex}`
    );
    const identity = chapters.find((chapter) => chapter.index === initialIndex);
    if (!viewport || !chapterRoot || !identity) return;
    const saved = readReadingPosition(novelId, identity);
    if (saved) {
      currentAnchor.current = saved;
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
    interactive.current = true;
  }, [chapters, initialIndex, initialLoaded, novelId, viewportRef]);

  const persistRef = useRef(persistCurrentPosition);
  useEffect(() => {
    persistRef.current = persistCurrentPosition;
  }, [persistCurrentPosition]);

  useEffect(
    () => () => {
      persistRef.current(undefined, progressRef.current.overallRatio);
      interactive.current = false;
      controller.cancel();
      window.clearTimeout(chromeTimer.current);
    },
    [controller.cancel]
  );

  if (!params.novelId) return <Navigate to="/library" replace />;
  if (initialIndex === null)
    return <Navigate to={`/library/${encodeURIComponent(novelId)}`} replace />;

  const position = Math.max(0, activePosition + 1);
  const anchor = currentAnchor.current;
  const bookmarked = activeSummary
    ? isBookmarked(novelId, activeSummary.id, anchor.paragraphId)
    : false;
  const readingStats = (() => {
    const text = activeChapter?.cleanText ?? activeChapter?.rawText ?? '';
    const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
    return { words, minutes: Math.max(1, Math.ceil(words / 220)) };
  })();

  const toggleCurrentBookmark = () => {
    const viewport = viewportRef.current;
    if (!viewport || !activeSummary) return;
    const chapterRoot =
      readerRoot.current?.querySelector<HTMLElement>(`#reader-chapter-${activeSummary.index}`) ??
      readerRoot.current ??
      viewport;
    const nextAnchor = captureReadingAnchor(viewport, chapterRoot);
    currentAnchor.current = nextAnchor;
    const saved = toggleBookmark({
      novelId,
      chapterId: activeSummary.id,
      chapterIndex: activeSummary.index,
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
      data-reader-theme={preferences.colorScheme}
      className="reader-surface min-h-full bg-bg text-text"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a, [role=dialog]')) return;
        setChrome((current) => {
          const next = !current;
          if (next) scheduleChromeHide();
          return next;
        });
      }}
    >
      <ReaderOfflineBanner offline={controller.offline} />
      <div
        className={cn(
          'fixed inset-x-0 top-0 z-[var(--z-nav)] transition-transform duration-[var(--motion-normal)]',
          chrome ? 'translate-y-0' : '-translate-y-full'
        )}
      >
        <ReaderToolbar
          title={model.detail.data?.novel.title ?? t('reader.loading')}
          progress={progress.overallPercent}
          chapterPosition={position}
          chapterCount={chapters.length}
          bookmarked={bookmarked}
          onBack={() => {
            persistCurrentPosition();
            controller.cancel();
            model.openOverview();
          }}
          onBookmark={toggleCurrentBookmark}
          onChapters={() => setChaptersOpen(true)}
          onPreferences={() => setPreferencesOpen(true)}
        />
        <ReaderProgress value={progress.overallPercent} />
      </div>

      <div className="mx-auto max-w-[var(--reader-content-max)] px-[var(--reader-page-x)] pb-36 pt-24">
        <ErrorBanner error={model.error} />
        {controller.error && !controller.loadingInitial && controller.chapters.length === 0 ? (
          <ErrorState
            title={t('reader.loadFailed')}
            description={
              controller.offline ? t('reader.offlineMissing') : t('reader.loadFailedDescription')
            }
            actionLabel={t('common.retry')}
            onAction={controller.retry}
          />
        ) : null}
        <div ref={topSentinel} aria-hidden className="h-px" />
        {controller.loadingPrevious ? (
          <div className="flex items-center justify-center gap-2 py-5 type-body-sm text-muted">
            <Spinner />
            <span>{t('reader.loadingPrevious')}</span>
          </div>
        ) : null}
        {controller.loadingInitial ? (
          <LoadingState title={t('reader.loading')} />
        ) : (
          controller.chapters.map((chapter) => (
            <section
              key={chapter.id}
              data-reader-chapter={chapter.index}
              className="motion-reader-enter border-b border-border/70 py-8 last:border-b-0"
            >
              <ChapterReader chapter={chapter} />
              {chapter.id === activeChapter?.id ? (
                <div className="mt-8 flex items-center justify-center gap-3 type-caption font-semibold text-muted">
                  <span>{t('reader.wordCount', { count: number(readingStats.words) })}</span>
                  <span aria-hidden>·</span>
                  <span>{t('reader.minutes', { count: number(readingStats.minutes) })}</span>
                </div>
              ) : null}
            </section>
          ))
        )}
        {controller.loadingNext ? (
          <div className="flex items-center justify-center gap-2 py-8 type-body-sm text-muted">
            <Spinner />
            <span>{t('reader.loadingNext')}</span>
          </div>
        ) : null}
        {!controller.hasNext && controller.chapters.length ? (
          <p className="py-10 text-center type-body-sm font-medium text-muted">
            {t('reader.endOfBook')}
          </p>
        ) : null}
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
          chapterTitle={activeSummary?.title ?? t('reader.loading')}
          chapterPosition={position}
          chapterCount={chapters.length}
          chapterPercent={progress.chapterPercent}
          bookPercent={progress.overallPercent}
          previous={Boolean(controller.previous)}
          next={Boolean(controller.next)}
          onPrevious={controller.navigatePrevious}
          onNext={controller.navigateNext}
        />
      </nav>
      <ChapterListSheet
        open={chaptersOpen}
        onOpenChange={setChaptersOpen}
        chapters={chapters}
        currentIndex={controller.activeIndex}
        readChapterIds={readIds}
        onSelect={(index) => model.openChapter(index)}
      />
      <ReaderPreferencesSheet open={preferencesOpen} onOpenChange={setPreferencesOpen} />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[calc(var(--z-nav)+2)] bg-black opacity-[var(--reader-dim-opacity)]"
      />
    </article>
  );
}
