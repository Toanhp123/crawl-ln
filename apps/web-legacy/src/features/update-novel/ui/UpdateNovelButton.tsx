import { RefreshCw } from 'lucide-react';
import { Button, type ActionState } from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';

export function UpdateNovelButton({
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
      variant="secondary"
      actionState={actionState}
      leadingIcon={<RefreshCw size={17} />}
      disabled={disabled}
      onClick={onClick}
    >
      {t('updateNovel.action')}
    </Button>
  );
}
