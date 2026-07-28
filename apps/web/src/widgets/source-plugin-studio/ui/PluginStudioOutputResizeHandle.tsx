import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

const KEYBOARD_STEP = 24;

export function PluginStudioOutputResizeHandle({
  label,
  onResize
}: {
  label: string;
  onResize: (delta: number) => void;
}) {
  const pointerRef = useRef<{ id: number; clientY: number } | null>(null);

  const releasePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerRef.current = null;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { id: event.pointerId, clientY: event.clientY };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const delta = pointer.clientY - event.clientY;
    if (delta === 0) return;
    pointer.clientY = event.clientY;
    onResize(delta);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onResize(KEYBOARD_STEP);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      onResize(-KEYBOARD_STEP);
    }
  };

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="horizontal"
      tabIndex={0}
      className="group relative z-10 hidden h-1.5 w-full touch-none cursor-row-resize outline-none md:block"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onKeyDown={handleKeyDown}
    >
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
    </div>
  );
}
