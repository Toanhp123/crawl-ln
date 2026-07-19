import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { readBackgroundScrollKey } from '@/shared/navigation/readerReturnState';
import { ScrollViewport } from '@/shared/ui';

const MAX_SCROLL_POSITIONS = 80;
const appScrollPositions = new Map<string, number>();

function rememberScrollPosition(key: string, value: number) {
  appScrollPositions.delete(key);
  appScrollPositions.set(key, value);
  while (appScrollPositions.size > MAX_SCROLL_POSITIONS) {
    const oldest = appScrollPositions.keys().next().value as string | undefined;
    if (!oldest) break;
    appScrollPositions.delete(oldest);
  }
}

export function AppScrollViewport({ children }: { children: ReactNode }) {
  const location = useLocation();
  const viewportRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const restoringRef = useRef(false);
  const scrollKey = readBackgroundScrollKey(location.state) ?? location.key;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const target = appScrollPositions.get(scrollKey) ?? 0;
    restoringRef.current = target > 0;
    let settled = false;
    const restore = () => {
      if (settled) return;
      const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTo({ top: Math.min(target, maxTop), behavior: 'auto' });
      if (target <= maxTop || target === 0) {
        settled = true;
        restoringRef.current = false;
      }
    };
    restore();
    const observer = new ResizeObserver(restore);
    if (!settled) observer.observe(content);
    return () => {
      observer.disconnect();
      if (!restoringRef.current) rememberScrollPosition(scrollKey, viewport.scrollTop);
      restoringRef.current = false;
    };
  }, [scrollKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const save = () => {
      if (!restoringRef.current) rememberScrollPosition(scrollKey, viewport.scrollTop);
    };
    const cancelRestore = () => {
      restoringRef.current = false;
      rememberScrollPosition(scrollKey, viewport.scrollTop);
    };
    viewport.addEventListener('scroll', save, { passive: true });
    viewport.addEventListener('wheel', cancelRestore, { passive: true });
    viewport.addEventListener('touchstart', cancelRestore, { passive: true });
    viewport.addEventListener('pointerdown', cancelRestore, { passive: true });
    return () => {
      save();
      viewport.removeEventListener('scroll', save);
      viewport.removeEventListener('wheel', cancelRestore);
      viewport.removeEventListener('touchstart', cancelRestore);
      viewport.removeEventListener('pointerdown', cancelRestore);
    };
  }, [scrollKey]);

  return (
    <ScrollViewport
      id="app-scroll-root"
      viewportRef={viewportRef}
      className="flex-1 scroll-pt-[var(--height-header)]"
    >
      <div ref={contentRef}>{children}</div>
    </ScrollViewport>
  );
}
