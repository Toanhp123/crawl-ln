import { useState } from 'react';
import { BookOpenText, BookPlus, FileText, SlidersHorizontal, X } from 'lucide-react';
import { LibrarySearchPanel } from '@/features/search-library';
import { useI18n } from '@/shared/i18n';
import { useScrollRestoration } from '@/shared/lib';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  ErrorState,
  IconButton,
  Page,
  PageHeader,
  Pagination,
  SearchInput,
  Skeleton,
  StickyToolbar,
  Text
} from '@/shared/ui';
import { ContinueReadingHero } from '@/widgets/continue-reading';
import { LibraryGrid } from '@/widgets/library-grid';
import { LIBRARY_PAGE_SIZE, useLibraryPage } from '../model/use-library-page';
import { LibraryControlsSheet } from './LibraryControlsSheet';

function LibraryCardSkeleton() {
  return (
    <Card padding="none" className="overflow-hidden" aria-hidden>
      <Skeleton className="aspect-[3/4] w-full rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-3 h-2 w-full rounded-full" />
        <Skeleton className="mt-3 h-9 w-full rounded-[var(--button-radius)]" />
      </div>
    </Card>
  );
}

function LibrarySkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      aria-hidden
      data-library-skeleton-count={LIBRARY_PAGE_SIZE}
    >
      {Array.from({ length: LIBRARY_PAGE_SIZE }, (_, index) => (
        <LibraryCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function LibraryPage() {
  useScrollRestoration('library');
  const { t } = useI18n();
  const model = useLibraryPage();
  const [controlsOpen, setControlsOpen] = useState(false);
  const primaryHistory = model.readingHistory[0];
  const isNovelScope = model.scope === 'novels';
  const showContinueRegion =
    Boolean(primaryHistory) && isNovelScope && !model.keyword && model.filter === 'all';
  const isInitialError = isNovelScope && model.novels.isError && !model.novels.data;
  const isEmpty = isNovelScope && !model.novels.isLoading && model.items.length === 0;

  if (isInitialError) {
    return (
      <Page>
        <PageHeader title={t('nav.library')} compact />
        <ErrorState
          title={t('library.loadFailed')}
          description={t('library.loadFailedDescription')}
          actionLabel={t('common.retry')}
          onAction={() => void model.retryLoad()}
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title={t('nav.library')}
        description={t('library.count', { count: model.total })}
        compact
      />
      {model.novels.data ? <ErrorBanner error={model.novels.error} /> : null}

      <StickyToolbar className="pb-4">
        <div className="flex items-center gap-2">
          <SearchInput
            className="min-w-0 flex-1"
            value={model.keyword}
            onChange={model.setKeyword}
            placeholder={t('library.search')}
          />
          {isNovelScope ? (
            <div className="relative shrink-0">
              <IconButton aria-label={t('library.controls')} onClick={() => setControlsOpen(true)}>
                <SlidersHorizontal size={20} />
              </IconButton>
              {model.activeControlCount ? (
                <span className="pointer-events-none absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 type-caption font-bold text-[hsl(var(--color-primary-contrast))]">
                  {model.activeControlCount}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          <Chip
            selected={isNovelScope}
            onClick={() => model.setScope('novels')}
            className="inline-flex shrink-0 items-center gap-1.5"
          >
            <BookOpenText size={16} />
            {t('library.searchScope.novels')}
          </Chip>
          <Chip
            selected={!isNovelScope}
            onClick={() => model.setScope('content')}
            className="inline-flex shrink-0 items-center gap-1.5"
          >
            <FileText size={16} />
            {t('library.searchScope.content')}
          </Chip>
        </div>
        {isNovelScope && model.activeControlCount ? (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {model.filter !== 'all' ? (
              <Chip selected onClick={() => model.setFilter('all')}>
                {t(`library.filter.${model.filter}`)} <X size={14} />
              </Chip>
            ) : null}
            {model.sort !== 'reading' ? (
              <Chip selected onClick={() => model.setSort('reading')}>
                {t(`library.sort.${model.sort}`)} <X size={14} />
              </Chip>
            ) : null}
            <Chip onClick={model.clearFilters}>{t('library.clearFilters')}</Chip>
          </div>
        ) : null}
      </StickyToolbar>

      {showContinueRegion && primaryHistory ? (
        <ContinueReadingHero
          readingHistory={primaryHistory.entry}
          novel={primaryHistory.novel}
          onOpen={() => model.openNovel(primaryHistory.novel.id)}
          onContinue={() =>
            model.continueNovel(primaryHistory.novel.id, primaryHistory.entry.chapterIndex)
          }
        />
      ) : null}

      {isNovelScope ? (
        <>
          <Text as="p" variant="supporting" tone="muted" className="font-semibold">
            {t('common.items', { count: model.total })}
          </Text>
          {model.novels.isLoading ? (
            <LibrarySkeleton />
          ) : isEmpty ? (
            model.keyword ? (
              <EmptyState
                title={t('library.empty.search', { query: model.keyword })}
                description={t('library.empty.searchDescription')}
                action={
                  <Button variant="secondary" onClick={() => model.setKeyword('')}>
                    {t('library.clearSearch')}
                  </Button>
                }
              />
            ) : model.filter !== 'all' ? (
              <EmptyState
                title={t('library.empty.filter')}
                description={t('library.empty.filterDescription')}
                action={
                  <Button variant="secondary" onClick={model.clearFilters}>
                    {t('library.clearFilters')}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title={t('library.empty.initial')}
                description={t('library.empty.initialDescription')}
                action={
                  <Button onClick={model.openImport}>
                    <BookPlus size={18} />
                    {t('library.importNovel')}
                  </Button>
                }
              />
            )
          ) : (
            <LibraryGrid
              novels={model.items}
              readingByNovel={model.readingByNovel}
              onOpen={model.openNovel}
              onRead={model.continueNovel}
              onContinueImport={model.continueImport}
            />
          )}
          {!model.novels.isLoading && model.totalPages > 1 ? (
            <Pagination page={model.page} totalPages={model.totalPages} onChange={model.setPage} />
          ) : null}
        </>
      ) : (
        <LibrarySearchPanel
          query={model.keyword}
          onQueryChange={model.setKeyword}
          type="chapter"
          page={model.page}
          onPageChange={model.setPage}
          showSearchInput={false}
          showTypeFilters={false}
          onSelect={model.openSearchResult}
        />
      )}

      <LibraryControlsSheet
        open={controlsOpen}
        onOpenChange={setControlsOpen}
        sort={model.sort}
        filter={model.filter}
        onSortChange={model.setSort}
        onFilterChange={model.setFilter}
      />
    </Page>
  );
}
