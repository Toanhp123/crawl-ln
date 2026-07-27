import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef } from 'react';
import { useI18n } from '../../i18n';
import { cn } from '../../lib/cn';
import { IconButton } from '../actions/IconButton';

const DISMISS_DISTANCE_PX = 96;
const INTERACTIVE_DRAG_BLOCK_SELECTOR =
  'button, a, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"], [data-sheet-no-drag]';

type DragState = {
  pointerId: number;
  startY: number;
  currentY: number;
};

export type ResponsiveDialogVariant = 'sheet' | 'drawer' | 'modal';

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  variant,
  className
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  variant: ResponsiveDialogVariant;
  className?: string;
}) {
  const { t } = useI18n();
  const lastTitleRef = useRef(title);
  if (title.trim()) lastTitleRef.current = title;
  const resolvedTitle = title.trim() || lastTitleRef.current || t('common.details');
  const dragStateRef = useRef<DragState | null>(null);
  const contentDescriptionProps = description ? {} : { 'aria-describedby': undefined };
  const desktopPanel = {
    sheet:
      'md:left-1/2 md:right-auto md:max-h-[var(--bottom-sheet-height)] md:w-[min(32rem,calc(100vw-2rem))] md:-translate-x-1/2 md:rounded-[var(--sheet-radius)] md:border',
    drawer:
      'motion-overlay-drawer md:inset-y-0 md:left-auto md:right-0 md:h-full md:max-h-none md:w-[min(100vw,var(--drawer-width))] md:translate-x-0 md:rounded-none md:border',
    modal:
      'motion-overlay-modal md:bottom-auto md:left-1/2 md:right-auto md:top-1/2 md:max-h-[88svh] md:w-[min(calc(100vw-2rem),var(--modal-width))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--sheet-radius)] md:border'
  }[variant];

  useEffect(() => {
    if (!open) dragStateRef.current = null;
  }, [open]);

  const releasePointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (variant !== 'sheet' && window.matchMedia('(min-width: 768px)').matches) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(INTERACTIVE_DRAG_BLOCK_SELECTOR))
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      currentY: event.clientY
    };
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    state.currentY = event.clientY;
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    releasePointer(event);
    dragStateRef.current = null;
    if (state.currentY - state.startY >= DISMISS_DISTANCE_PX) onOpenChange(false);
  };

  const handleDragCancel = (event: ReactPointerEvent<HTMLElement>) => {
    releasePointer(event);
    dragStateRef.current = null;
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-overlay-fade fixed inset-0 z-40 bg-[hsl(var(--color-overlay)/0.58)] backdrop-blur-[2px]" />
        <Dialog.Content
          {...contentDescriptionProps}
          className={cn(
            'motion-sheet-slide-up fixed inset-x-0 bottom-0 z-50 flex max-h-[calc(100dvh-env(safe-area-inset-top)-var(--space-2))] flex-col overflow-hidden rounded-t-[var(--sheet-radius)] border border-b-0 border-border bg-[hsl(var(--color-bg-elevated))] shadow-[var(--elevation-3)] outline-none',
            desktopPanel,
            className
          )}
        >
          <div
            className="flex h-6 shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing md:hidden"
            data-sheet-drag-region="handle"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragCancel}
          >
            <span className="h-1 w-10 rounded-full bg-border-strong" />
          </div>
          <header
            className="flex touch-none shrink-0 cursor-grab items-center justify-between gap-3 border-b border-border px-4 py-3 active:cursor-grabbing"
            data-sheet-drag-region="header"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragCancel}
          >
            <div className="min-w-0">
              <Dialog.Title className="type-title font-bold text-text">
                {resolvedTitle}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 type-supporting text-muted">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <IconButton variant="ghost" aria-label={t('common.close')}>
                <X size={19} />
              </IconButton>
            </Dialog.Close>
          </header>
          {children ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-4 pb-[calc(var(--space-6)+env(safe-area-inset-bottom))] pt-3 md:pb-6">
              {children}
            </div>
          ) : null}
          {footer ? <div className="shrink-0 border-t border-border p-4">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
