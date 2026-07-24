import { useI18n } from '../../i18n/I18nProvider';
import { InlineNotice } from './InlineNotice';

export function ErrorBanner({ error }: { error: unknown }) {
  const { errorMessage } = useI18n();
  if (!error) return null;

  return (
    <InlineNotice tone="danger">{errorMessage(error, 'common.errorDescription')}</InlineNotice>
  );
}
