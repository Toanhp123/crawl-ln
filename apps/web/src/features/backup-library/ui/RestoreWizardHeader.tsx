import { ArrowLeft } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Button, Progress, Text } from '../../../shared/ui';

export function RestoreWizardHeader({
  current,
  total,
  title,
  canGoBack,
  onBack
}: {
  current: number;
  total: 8;
  title: string;
  canGoBack: boolean;
  onBack(): void;
}) {
  const { t } = useI18n();
  return (
    <header className="space-y-2" data-restore-wizard-header>
      <div className="flex items-start gap-2">
        {canGoBack ? (
          <Button variant="ghost" size="sm" onClick={onBack} aria-label={t('backup.restore.back')}>
            <ArrowLeft size={16} />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <Text as="p" variant="caption" tone="muted">
            {t('backup.restore.step', { current, total })}
          </Text>
          <Text as="h3" variant="titleSm">
            {title}
          </Text>
        </div>
      </div>
      <Progress value={(current / total) * 100} label={t('backup.restore.navigationProgress')} />
    </header>
  );
}
