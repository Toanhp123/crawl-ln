import { Spinner } from './Spinner';
import { useI18n } from '../../i18n/I18nProvider';
export function LoadingState({ title, description }: { title?: string; description?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3">
      <Spinner />
      <div>
        <p className="type-body-sm font-semibold text-text">{title ?? t('common.loadingData')}</p>
        {description && <p className="type-caption text-muted">{description}</p>}
      </div>
    </div>
  );
}
