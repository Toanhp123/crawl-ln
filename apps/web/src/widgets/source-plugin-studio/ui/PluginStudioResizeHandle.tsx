import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '../../../shared/lib/cn';
import { PLUGIN_STUDIO_LAYOUT } from '../model/source-plugin-studio-layout';

export function PluginStudioResizeHandle({
  label,
  edge,
  disabled = false,
  onResize
}: {
  label: string;
  edge: 'left' | 'right';
  disabled?: boolean;
  onResize: (delta: number) => void;
}) {
  const pointerRef = useRef<{ id: number; clientX: number } | null>(null);

  const releasePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerRef.current = null;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { id: event.pointerId, clientX: event.clientX };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (disabled || !pointer || pointer.id !== event.pointerId) return;
    const delta = event.clientX - pointer.clientX;
    if (delta === 0) return;
    pointer.clientX = event.clientX;
    onResize(delta);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onResize(-PLUGIN_STUDIO_LAYOUT.keyboardStep);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onResize(PLUGIN_STUDIO_LAYOUT.keyboardStep);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      data-edge={edge}
      className={cn(
        'group relative z-10 h-full w-2 touch-none cursor-col-resize outline-none',
        'focus-visible:bg-primary-subtle focus-visible:shadow-[var(--focus-ring)]',
        disabled && 'pointer-events-none cursor-default opacity-50'
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onKeyDown={handleKeyDown}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary"
      />
    </div>
  );
}
