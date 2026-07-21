import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useI18n } from '../../i18n';
import { IconButton } from '../actions/IconButton';

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = 'right',
  className
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  side?: 'right' | 'bottom';
  className?: string;
}) {
  const { t } = useI18n();
  const panel =
    side === 'bottom'
      ? 'inset-x-0 bottom-0 h-[min(88svh,var(--bottom-sheet-height))] rounded-t-[var(--sheet-radius)] shadow-[var(--elevation-3)]'
      : 'inset-x-0 bottom-0 h-[min(88svh,var(--bottom-sheet-height))] rounded-t-[var(--sheet-radius)] shadow-[var(--elevation-3)] md:inset-y-0 md:left-auto md:right-0 md:h-full md:max-h-none md:w-[min(100vw,var(--drawer-width))] md:rounded-none md:shadow-[var(--elevation-3)]';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[hsl(var(--color-overlay)/0.65)] backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden border border-border bg-surface outline-none',
            panel,
            className
          )}
        >
          <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-border md:hidden" />
          <div className="shrink-0 border-b border-border bg-surface/95 p-4 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Dialog.Title className="truncate type-title font-bold text-text">
                  {title}
                </Dialog.Title>
                {description && (
                  <Dialog.Description className="mt-1 type-supporting text-muted">
                    {description}
                  </Dialog.Description>
                )}
              </div>
              <Dialog.Close asChild>
                <IconButton aria-label={t('common.close')}>
                  <X size={18} />
                </IconButton>
              </Dialog.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(var(--height-bottom-nav)+2rem+env(safe-area-inset-bottom))] md:pb-6">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
