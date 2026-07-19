import { useEffect, useRef } from 'react';

type Options = { enabled: boolean; onPrevious: () => void; onNext: () => void };

export function useSwipeChapterNavigation({ enabled, onPrevious, onNext }: Options) {
  const start = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const root = document.getElementById('reader-content');
    if (!root) return;
    const onTouchStart = (event: TouchEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('button, a, input, select, textarea, [role=dialog]')) return;
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY, time: performance.now() };
    };
    const onTouchEnd = (event: TouchEvent) => {
      const origin = start.current;
      start.current = null;
      if (!origin || event.changedTouches.length === 0) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      const elapsed = Math.max(1, performance.now() - origin.time);
      const horizontal = Math.abs(dx) > Math.abs(dy) * 1.35;
      const deliberate = Math.abs(dx) >= 72 || Math.abs(dx) / elapsed >= 0.55;
      if (!horizontal || !deliberate) return;
      if (dx < 0) onNext();
      else onPrevious();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select')) return;
      if (event.key === 'ArrowRight') onNext();
      if (event.key === 'ArrowLeft') onPrevious();
    };
    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, onNext, onPrevious]);
}
