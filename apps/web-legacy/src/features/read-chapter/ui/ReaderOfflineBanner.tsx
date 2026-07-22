import { WifiOff } from 'lucide-react';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Text } from '@/shared/ui';

export function ReaderOfflineBanner({ offline }: { offline: boolean }) {
  const { t } = useI18n();
  if (!offline) return null;
  return (
    <div className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[calc(var(--z-nav)+1)] -translate-x-1/2 rounded-pill border border-border bg-surface px-3 py-1.5 text-muted shadow-[var(--elevation-1)] backdrop-blur-xl">
      <Text as="span" variant="caption" className="inline-flex items-center gap-1.5 font-bold">
        <WifiOff size={13} />
        {t('reader.offline')}
      </Text>
    </div>
  );
}
