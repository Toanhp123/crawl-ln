import { FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readerNavigationState } from '@/shared/navigation/readerReturnState';
import { useSearchLibrary } from '../model/useSearchLibrary';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { EmptyState, ErrorBanner, Pagination, Panel, Skeleton, Text } from '@/shared/ui';

function Highlighted({ value }: { value: string }) {
  const parts = value.split(/(<mark>|<\/mark>)/i);
  let marked = false;
  return (
    <>
      {parts.map((part, index) => {
        if (/^<mark>$/i.test(part)) {
          marked = true;
          return null;
        }
        if (/^<\/mark>$/i.test(part)) {
          marked = false;
          return null;
        }
        return marked ? (
          <mark key={index} className="rounded bg-primary-state-hover px-0.5 text-text">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </>
  );
}

function ContentSearchSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 5 }, (_, index) => (
        <Panel key={index} className="space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </Panel>
      ))}
    </div>
  );
}

export function LibraryContentSearch({ query }: { query: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const normalized = query.trim();
  const results = useSearchLibrary(normalized, 'chapter', (page - 1) * 20);
  useEffect(() => setPage(1), [normalized]);
  const totalPages = Math.max(1, Math.ceil((results.data?.total ?? 0) / 20));

  if (!normalized) {
    return (
      <EmptyState
        title={t('library.contentSearch.emptyTitle')}
        description={t('library.contentSearch.emptyDescription')}
      />
    );
  }

  if (results.isLoading) return <ContentSearchSkeleton />;

  if (results.isError && !results.data) {
    return <ErrorBanner error={results.error} />;
  }

  if (!results.data?.items.length) {
    return (
      <EmptyState
        title={t('library.contentSearch.noResults', { query: normalized })}
        description={t('search.noResultsDescription')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ErrorBanner error={results.error} />
      <Text as="p" variant="supporting" tone="muted" className="font-semibold">
        {t('search.resultCount', { count: results.data.total })}
      </Text>
      <div className="space-y-3">
        {results.data.items.map((item) => (
          <button
            key={`${item.type}-${item.documentId}`}
            type="button"
            onClick={() =>
              navigate(
                item.chapterIndex === undefined
                  ? `/library/${encodeURIComponent(item.novelId)}`
                  : `/library/${encodeURIComponent(item.novelId)}/read/${item.chapterIndex}`,
                item.chapterIndex === undefined ? undefined : { state: readerNavigationState() }
              )
            }
            className="block w-full text-left"
          >
            <Panel className="space-y-2 transition-colors duration-[var(--motion-fast)] hover:bg-surface2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Text as="h2" variant="title" className="truncate">
                    {item.title}
                  </Text>
                  <Text as="p" variant="caption" tone="muted" className="truncate">
                    {item.novelTitle} · {t('common.chapter')} {item.chapterIndex}
                  </Text>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface2 px-2 py-1 type-caption font-bold uppercase text-muted">
                  <FileText size={12} />
                  {t('search.chapter')}
                </span>
              </div>
              <Text as="p" variant="supporting" tone="muted" className="line-clamp-3">
                <Highlighted value={item.snippet} />
              </Text>
            </Panel>
          </button>
        ))}
      </div>
      {totalPages > 1 ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          onChange={(nextPage) => {
            setPage(nextPage);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      ) : null}
    </div>
  );
}
