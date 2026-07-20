import { createContext, type MutableRefObject, type ReactNode, useContext, useRef } from 'react';
import { cn } from '@/shared/lib/cn';

const ScrollViewportContext = createContext<MutableRefObject<HTMLElement | null> | null>(null);

export function ScrollViewport({
  children,
  id,
  className,
  viewportRef,
  as = 'main'
}: {
  children: ReactNode;
  id: string;
  className?: string;
  viewportRef?: MutableRefObject<HTMLElement | null>;
  as?: 'main' | 'div';
}) {
  const internalRef = useRef<HTMLElement | null>(null);
  const resolvedRef = viewportRef ?? internalRef;
  const Component = as;
  return (
    <ScrollViewportContext.Provider value={resolvedRef}>
      <Component
        ref={(node) => {
          resolvedRef.current = node;
        }}
        id={id}
        tabIndex={-1}
        className={cn('min-h-0 overflow-y-auto overscroll-y-contain', className)}
      >
        {children}
      </Component>
    </ScrollViewportContext.Provider>
  );
}

export function useScrollViewport() {
  const context = useContext(ScrollViewportContext);
  if (!context) throw new Error('useScrollViewport must be used inside ScrollViewport');
  return context;
}
