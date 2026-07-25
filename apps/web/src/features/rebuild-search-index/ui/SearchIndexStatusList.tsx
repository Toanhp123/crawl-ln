import { useEffect, useState } from 'react';
import type { SearchIndexStatus } from '../../../entities/search';
import { useI18n } from '../../../shared/i18n';
import { formatRelativeTimestamp } from '../../../shared/lib';
import { Chip, StatusList } from '../../../shared/ui';
import { getSearchIndexDisplayState } from '../model/search-index-presentation';

const localeByLanguage = {
  en: 'en-US',
  vi: 'vi-VN'
} as const;

export function SearchIndexStatusList({
  status,
  refreshIntervalMs = 30_000
}: {
  status: SearchIndexStatus;
  refreshIntervalMs?: number;
}) {
  const { language, number, t } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), refreshIntervalMs);
    return () => globalThis.clearInterval(timer);
  }, [refreshIntervalMs]);

  const state = getSearchIndexDisplayState(status);
  const rebuilt = formatRelativeTimestamp(status.lastRebuiltAt, {
    locale: localeByLanguage[language],
    now
  });

  return (
    <StatusList
      aria-label={t('searchIndex.statusList')}
      data-search-index-status-list=""
      items={[
        {
          key: 'state',
          label: t('searchIndex.state'),
          value: (
            <Chip tone={state.tone} size="sm">
              {t(`searchIndex.state.${state.key}`)}
            </Chip>
          )
        },
        {
          key: 'currentDocuments',
          label: t('searchIndex.currentDocuments'),
          value:
            status.indexedDocuments === 0 ? t('searchIndex.empty') : number(status.indexedDocuments)
        },
        {
          key: 'lastRebuild',
          label: t('searchIndex.lastRebuild'),
          value: rebuilt?.relative ?? t('searchIndex.neverRebuilt'),
          description: rebuilt?.absolute
        },
        {
          key: 'lastRebuildDocuments',
          label: t('searchIndex.lastRebuildDocuments'),
          value:
            status.lastIndexedDocuments === null
              ? t('searchIndex.noData')
              : status.lastIndexedDocuments === 0
                ? t('searchIndex.empty')
                : number(status.lastIndexedDocuments)
        }
      ]}
    />
  );
}
