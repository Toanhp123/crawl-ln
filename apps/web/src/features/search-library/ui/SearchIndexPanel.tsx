import { useMutation } from '@tanstack/react-query';
import { DatabaseZap } from 'lucide-react';
import { rebuildSearchIndex } from '../api/searchLibrary';
import { Button, ErrorBanner, Panel, Text } from '@/shared/ui';
import type { TranslationKey } from '@/shared/i18n/I18nProvider';
export function SearchIndexPanel({
  t
}: {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const m = useMutation({ mutationFn: rebuildSearchIndex });
  return (
    <div className="space-y-3">
      <Panel className="space-y-3">
        <div className="flex gap-3">
          <DatabaseZap className="text-primary" size={20} />
          <div>
            <Text as="h3" variant="label">
              {t('search.indexTitle')}
            </Text>
            <Text as="p" variant="supporting" tone="muted">
              {t('search.indexDescription')}
            </Text>
          </div>
        </div>
        <Button
          actionState={m.status}
          leadingIcon={<DatabaseZap size={17} />}
          onClick={() => m.mutate()}
        >
          {t('search.rebuild')}
        </Button>
        {m.data ? (
          <Text variant="supporting" tone="muted">
            {t('search.rebuilt', { count: m.data.indexedDocuments })}
          </Text>
        ) : null}
      </Panel>
      <ErrorBanner error={m.error} />
    </div>
  );
}
