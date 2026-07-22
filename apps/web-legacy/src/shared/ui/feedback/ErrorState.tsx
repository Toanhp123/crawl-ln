import { AlertTriangle } from 'lucide-react';
import { Button } from '../actions/Button';
import { useI18n } from '../../i18n/I18nProvider';
export function ErrorState({
  title,
  description,
  actionLabel,
  onAction
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-[50svh] place-items-center p-4">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-danger-state-border bg-surface p-5 text-center">
        <div className="mx-auto mb-3 grid h-[var(--icon-box-lg)] w-[var(--icon-box-lg)] place-items-center rounded-full border border-danger-state-border text-danger">
          <AlertTriangle size={20} />
        </div>
        <h2 className="type-title-sm font-bold text-text">{title ?? t('common.error')}</h2>
        {description && <p className="mt-2 type-supporting text-muted">{description}</p>}
        {actionLabel && onAction && (
          <Button className="mt-4" variant="secondary" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
