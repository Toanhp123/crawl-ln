import { Play } from 'lucide-react';
import { Button, type ActionState } from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';

export function CrawlNovelButton({
  actionState,
  disabled,
  onClick
}: {
  actionState: ActionState;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <Button
      onClick={onClick}
      actionState={actionState}
      leadingIcon={<Play size={17} />}
      disabled={disabled}
      full
      className="sm:w-auto"
    >
      {t('crawl.start')}
    </Button>
  );
}
