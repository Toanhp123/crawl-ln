import { type RefObject, useEffect, useState } from 'react';

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function useReaderProgress(
  activeChapterIndex: number | null,
  chapterPosition: number,
  chapterCount: number,
  viewportRef: RefObject<HTMLElement | null>,
  contentRootRef: RefObject<HTMLElement | null>
) {
  const [chapterRatio, setChapterRatio] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      if (activeChapterIndex === null) {
        setChapterRatio(0);
        return;
      }
      const content = contentRootRef.current?.querySelector<HTMLElement>(
        `[data-reader-chapter="${activeChapterIndex}"]`
      );
      if (!content) {
        setChapterRatio(0);
        return;
      }
      const viewportRect = viewport.getBoundingClientRect();
      const rect = content.getBoundingClientRect();
      const contentTop = viewport.scrollTop + rect.top - viewportRect.top;
      const readable = Math.max(1, content.offsetHeight - viewport.clientHeight * 0.55);
      setChapterRatio(
        clamp((viewport.scrollTop - contentTop + viewport.clientHeight * 0.2) / readable)
      );
    };
    update();
    viewport.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [activeChapterIndex, contentRootRef, viewportRef]);

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
