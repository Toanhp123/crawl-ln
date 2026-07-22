import { DatabaseZap } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Button } from '../../../shared/ui';
import { useRebuildSearchIndex } from '../model/use-rebuild-search-index';

export function RebuildSearchIndexButton() {
  const mutation = useRebuildSearchIndex();
  const { t } = useI18n();
  return (
    <Button
      actionState={mutation.status}
      feedbackPolicy="longRunning"
      leadingIcon={<DatabaseZap size={16} />}
      onClick={() => mutation.mutate()}
    >
      {t('searchIndex.action')}
    </Button>
  );
}
