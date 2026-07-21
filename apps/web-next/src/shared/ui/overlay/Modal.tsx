import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { IconButton } from '../actions/IconButton';

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[hsl(var(--color-overlay)/0.65)] backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[88svh] overflow-hidden rounded-t-[var(--sheet-radius)] border border-b-0 border-border bg-surface shadow-[var(--elevation-3)] outline-none md:bottom-auto md:left-1/2 md:right-auto md:top-1/2 md:w-[min(calc(100vw-2rem),var(--modal-width))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--sheet-radius)] md:border',
            className
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0">
              <Dialog.Title className="type-title font-semibold text-text">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 type-supporting text-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <IconButton aria-label={t('common.close')}>
                <X size={20} />
              </IconButton>
            </Dialog.Close>
          </div>
          {children && (
            <div className="max-h-[calc(88svh-9rem)] overflow-y-auto p-4">{children}</div>
          )}
          {footer && <div className="border-t border-border p-4">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
