import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { IconButton } from '../actions/IconButton';

type ToastKind = 'success' | 'error' | 'info';
type ToastInput = {
  kind: ToastKind;
  title: string;
  description?: string;
};
type ToastItem = ToastInput & { id: string };

const EVENT = 'novel-tool:toast';

function makeId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function toast(input: ToastInput) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { ...input, id: makeId() } }));
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const item = (event as CustomEvent<ToastItem>).detail;
      setItems((prev) => [...prev.slice(-3), item]);
    };

    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, [dismiss]);

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      <>{children}</>
      {items.map((item) => (
        <ToastPrimitive.Root
          key={item.id}
          onOpenChange={(open) => !open && dismiss(item.id)}
          className="motion-toast-slide-inline grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3 shadow-[var(--elevation-2)]"
        >
          <div
            className={
              item.kind === 'success'
                ? 'text-success'
                : item.kind === 'error'
                  ? 'text-danger'
                  : 'text-primary'
            }
          >
            {item.kind === 'success' ? (
              <CheckCircle2 size={20} />
            ) : item.kind === 'error' ? (
              <XCircle size={20} />
            ) : (
              <Info size={20} />
            )}
          </div>
          <div>
            <ToastPrimitive.Title className="type-body-sm font-bold text-text">
              {item.title}
            </ToastPrimitive.Title>
            {item.description ? (
              <ToastPrimitive.Description className="mt-1 type-caption text-muted">
                {item.description}
              </ToastPrimitive.Description>
            ) : null}
          </div>
          <ToastPrimitive.Close asChild>
            <IconButton aria-label={t('common.close')} className="h-8 w-8">
              <X size={15} />
            </IconButton>
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport
        aria-label={t('common.notifications')}
        className="fixed bottom-[calc(var(--height-bottom-nav)+1rem)] right-4 z-[60] flex w-[min(calc(100vw-2rem),var(--toast-width))] flex-col gap-2 md:bottom-4"
      />
    </ToastPrimitive.Provider>
  );
}
