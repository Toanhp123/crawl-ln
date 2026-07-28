import {
  type MutableRefObject,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import {
  createReaderChromeScrollState,
  updateReaderChromeScrollState
} from './reader-chrome-scroll';

interface LoadedChapter {
  index: number;
}

interface ReaderProgressSnapshot {
  chapterRatio: number;
  chapterPercent: number;
  overallRatio: number;
  overallPercent: number;
}

interface ReaderScrollCoordinatorOptions {
  novelId: string;
  chapterCount: number;
  chapterPosition: (index: number) => number;
  activeIndex: number;
  loadedChapters: readonly LoadedChapter[];
  hasPrevious: boolean;
  hasNext: boolean;
  loadingPrevious: boolean;
  loadingNext: boolean;
  chromeVisible: boolean;
  setActiveIndex: (index: number) => void;
  loadPrevious: () => Promise<boolean>;
  loadNext: () => Promise<boolean>;
  viewportRef: RefObject<HTMLElement | null>;
  readerRootRef: RefObject<HTMLElement | null>;
  topSentinelRef: RefObject<HTMLElement | null>;
  bottomSentinelRef: RefObject<HTMLElement | null>;
  interactiveRef: MutableRefObject<boolean>;
  onChromeChange: (visible: boolean) => void;
  onPersist: (activeIndex: number, overallRatio: number) => void;
}

const EMPTY_PROGRESS: ReaderProgressSnapshot = {
  chapterRatio: 0,
  chapterPercent: 0,
  overallRatio: 0,
  overallPercent: 0
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function replaceReaderUrl(novelId: string, chapterIndex: number): void {
  const pathname = `/library/${encodeURIComponent(novelId)}/read/${chapterIndex}`;
  if (window.location.pathname === pathname) return;
  window.history.replaceState(
    window.history.state,
    '',
    `${pathname}${window.location.search}${window.location.hash}`
  );
}

function chapterAtProbe(root: HTMLElement, viewport: HTMLElement): HTMLElement | null {
  const viewportRect = viewport.getBoundingClientRect();
  const x = viewportRect.left + Math.min(viewport.clientWidth / 2, viewportRect.width - 1);
  const y = viewportRect.top + Math.min(viewport.clientHeight * 0.32, viewportRect.height - 1);
  const hit = document.elementFromPoint(x, y);
  const direct =
    hit instanceof HTMLElement ? hit.closest<HTMLElement>('[data-reader-chapter]') : null;
  if (direct && root.contains(direct)) return direct;
  const sections = root.querySelectorAll<HTMLElement>('[data-reader-chapter]');
  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    if (rect.top <= y && rect.bottom > y) return section;
  }
  return null;
}

function progressFor(
  chapter: HTMLElement,
  viewport: HTMLElement,
  chapterPosition: number,
  chapterCount: number
): ReaderProgressSnapshot {
  const viewportRect = viewport.getBoundingClientRect();
  const rect = chapter.getBoundingClientRect();
  const contentTop = viewport.scrollTop + rect.top - viewportRect.top;
  const readable = Math.max(1, chapter.offsetHeight - viewport.clientHeight * 0.55);
  const chapterRatio = clamp(
    (viewport.scrollTop - contentTop + viewport.clientHeight * 0.2) / readable
  );
  const overallRatio =
    chapterCount > 0 && chapterPosition >= 0
      ? clamp((chapterPosition + chapterRatio) / chapterCount)
      : 0;
  return {
    chapterRatio,
    chapterPercent: Math.round(chapterRatio * 100),
    overallRatio,
    overallPercent: Math.round(overallRatio * 100)
  };
}

export function useReaderScrollCoordinator({
  novelId,
  chapterCount,
  chapterPosition,
  activeIndex,
  loadedChapters,
  hasPrevious,
  hasNext,
  loadingPrevious,
  loadingNext,
  chromeVisible,
  setActiveIndex,
  loadPrevious,
  loadNext,
  viewportRef,
  readerRootRef,
  topSentinelRef,
  bottomSentinelRef,
  interactiveRef,
  onChromeChange,
  onPersist
}: ReaderScrollCoordinatorOptions): ReaderProgressSnapshot {
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const activeIndexRef = useRef(activeIndex);
  const progressRef = useRef(progress);
  const chromeVisibleRef = useRef(chromeVisible);
  const callbacksRef = useRef({ chapterPosition, onChromeChange, onPersist });
  const prependRef = useRef<{
    firstIndex: number;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  activeIndexRef.current = activeIndex;
  progressRef.current = progress;
  chromeVisibleRef.current = chromeVisible;
  callbacksRef.current = { chapterPosition, onChromeChange, onPersist };

  useLayoutEffect(() => {
    const pending = prependRef.current;
    const viewport = viewportRef.current;
    const firstIndex = loadedChapters[0]?.index;
    if (!pending || !viewport || firstIndex === undefined || firstIndex >= pending.firstIndex)
      return;
    prependRef.current = null;
    viewport.scrollTo({
      top: pending.scrollTop + viewport.scrollHeight - pending.scrollHeight,
      behavior: 'auto'
    });
  }, [loadedChapters, viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const root = readerRootRef.current;
    if (!viewport || !root) return;
    let frame = 0;
    let persistTimer = 0;
    let chromeScrollState = createReaderChromeScrollState(
      viewport.scrollTop,
      chromeVisibleRef.current
    );

    const update = () => {
      frame = 0;
      if (!interactiveRef.current) return;
      const scrollTop = viewport.scrollTop;
      chromeScrollState = updateReaderChromeScrollState(
        { ...chromeScrollState, visible: chromeVisibleRef.current },
        scrollTop
      );
      if (chromeScrollState.visible !== chromeVisibleRef.current) {
        chromeVisibleRef.current = chromeScrollState.visible;
        callbacksRef.current.onChromeChange(chromeScrollState.visible);
      }

      const chapter = chapterAtProbe(root, viewport);
      const index = Number(chapter?.dataset.readerChapter);
      if (!chapter || !Number.isInteger(index)) return;
      if (index !== activeIndexRef.current) {
        activeIndexRef.current = index;
        setActiveIndex(index);
        replaceReaderUrl(novelId, index);
      }
      const nextProgress = progressFor(
        chapter,
        viewport,
        callbacksRef.current.chapterPosition(index),
        chapterCount
      );
      progressRef.current = nextProgress;
      setProgress((current) =>
        current.chapterPercent === nextProgress.chapterPercent &&
        current.overallPercent === nextProgress.overallPercent
          ? current
          : nextProgress
      );
      window.clearTimeout(persistTimer);
      persistTimer = window.setTimeout(
        () =>
          callbacksRef.current.onPersist(activeIndexRef.current, progressRef.current.overallRatio),
        220
      );
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    viewport.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(persistTimer);
      viewport.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [chapterCount, interactiveRef, novelId, readerRootRef, setActiveIndex, viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const top = topSentinelRef.current;
    const bottom = bottomSentinelRef.current;
    if (!viewport || !top || !bottom) return;
    const topObserver = new IntersectionObserver(
      (entries) => {
        if (
          !interactiveRef.current ||
          !hasPrevious ||
          loadingPrevious ||
          !entries.some((entry) => entry.isIntersecting)
        )
          return;
        prependRef.current = {
          firstIndex: loadedChapters[0]?.index ?? activeIndexRef.current,
          scrollHeight: viewport.scrollHeight,
          scrollTop: viewport.scrollTop
        };
        void loadPrevious();
      },
      { root: viewport, rootMargin: '500px 0px 0px' }
    );
    const bottomObserver = new IntersectionObserver(
      (entries) => {
        if (
          interactiveRef.current &&
          hasNext &&
          !loadingNext &&
          entries.some((entry) => entry.isIntersecting)
        ) {
          void loadNext();
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
    hasNext,
    hasPrevious,
    interactiveRef,
    loadNext,
    loadPrevious,
    loadedChapters,
    loadingNext,
    loadingPrevious,
    bottomSentinelRef,
    topSentinelRef,
    viewportRef
  ]);

  return progress;
}
