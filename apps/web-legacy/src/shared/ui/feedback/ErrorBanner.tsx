import { useI18n } from '../../i18n/I18nProvider';
export function ErrorBanner({ error }: { error: unknown }) {
  const { errorMessage } = useI18n();
  if (!error) return null;
  const message = errorMessage(error, 'common.errorDescription');
  return (
    <div
      className="rounded-[var(--radius-md)] border border-danger-state-border bg-danger-subtle p-3 type-body-sm text-danger"
      role="alert"
    >
      {message}
    </div>
  );
}
