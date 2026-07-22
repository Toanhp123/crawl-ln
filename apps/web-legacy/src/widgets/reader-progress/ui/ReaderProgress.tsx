import { Progress } from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';
export function ReaderProgress({ value }: { value: number }) {
  const { t, number } = useI18n();
  return (
    <div aria-label={t('reader.progressPercent', { value: number(value) })}>
      <Progress value={value} />
    </div>
  );
}
