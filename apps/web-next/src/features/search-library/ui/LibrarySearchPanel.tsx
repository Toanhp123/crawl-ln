import type { SearchDocumentType, SearchResultItem } from '../../../entities/search';
import { useI18n } from '../../../shared/i18n';
import {
  EmptyState,
  ErrorBanner,
  FilterChip,
  ListRow,
  LoadingState,
  Pagination,
  SearchInput,
  Stack,
  Text
} from '../../../shared/ui';
import { useSearchLibraryFeature } from '../model/use-search-library-feature';

const types: SearchDocumentType[] = ['all', 'novel', 'chapter'];

export function LibrarySearchPanel({ onSelect }: { onSelect?: (item: SearchResultItem) => void }) {
  const model = useSearchLibraryFeature({ onSelect });
  const { t } = useI18n();
  const items = model.result.data?.items ?? [];
  return (
    <Stack gap="md">
      <SearchInput
        value={model.query}
        onChange={model.setQuery}
        placeholder={t('search.placeholder')}
      />
      <div className="flex flex-wrap gap-2">
        {types.map((type) => (
          <FilterChip key={type} selected={model.type === type} onClick={() => model.setType(type)}>
            {t(`search.type.${type}`)}
          </FilterChip>
        ))}
      </div>
      {!model.query.trim() ? (
        <EmptyState title={t('search.emptyTitle')} description={t('search.emptyDescription')} />
      ) : model.result.isLoading ? (
        <LoadingState title={t('search.loading')} />
      ) : model.result.isError && !model.result.data ? (
        <ErrorBanner error={model.result.error} />
      ) : items.length === 0 ? (
        <EmptyState title={t('search.noResults')} description={t('search.noResultsDescription')} />
      ) : (
        <Stack gap="sm">
          <Text variant="supporting" tone="muted">
            {t('search.resultCount', { count: model.result.data?.total ?? 0 })}
          </Text>
          {items.map((item) => (
            <ListRow
              key={`${item.type}-${item.documentId}`}
              title={item.title}
              description={`${item.novelTitle} · ${item.snippet}`}
              onClick={() => model.select(item)}
            />
          ))}
          {model.totalPages > 1 ? (
            <Pagination page={model.page} totalPages={model.totalPages} onChange={model.setPage} />
          ) : null}
        </Stack>
      )}
    </Stack>
  );
}
