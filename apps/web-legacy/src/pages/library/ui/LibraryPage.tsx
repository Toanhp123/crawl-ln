import { useScrollRestoration } from '@/shared/lib/useScrollRestoration';
import { BookOpenText, BookPlus, FileText, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { LibraryGrid } from '@/widgets/library-grid';
import { ContinueReadingHero } from '@/widgets/continue-reading/ui/ContinueReadingHero';
import { LibraryControlsSheet } from '@/features/filter-library/ui/LibraryControlsSheet';
import { LibraryContentSearch } from '@/features/search-library/ui/LibraryContentSearch';
import { useI18n, type TranslationKey } from '@/shared/i18n/I18nProvider';
import {
  Button,
  EmptyState,
  ErrorBanner,
  ErrorState,
  Card,
  Chip,
  IconButton,
  Page,
  PageHeader,
  Pagination,
  SearchInput,
  Skeleton,
  StickyToolbar,
  Text
} from '@/shared/ui';
import { LIBRARY_PAGE_SIZE, useLibraryPage } from '../model/useLibraryPage';
import { useGlobalAddNovel } from '@/shared/model/GlobalAddNovelContext';

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
  const addNovel = useGlobalAddNovel();
  const [controlsOpen, setControlsOpen] = useState(false);
  const primaryHistory = model.readingHistory[0];
  const activeControlCount = model.activeFilterChips.length;
  const isNovelScope = model.searchScope === 'novels';
  const showContinueRegion =
    Boolean(primaryHistory) && isNovelScope && !model.keyword && model.filter === 'all';
  const isInitialError = isNovelScope && model.novels.isError && !model.novels.data;
  const isEmpty = isNovelScope && !model.novels.isLoading && model.visibleItems.length === 0;

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
              {activeControlCount ? (
                <span className="pointer-events-none absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 type-caption font-bold text-[hsl(var(--color-primary-contrast))]">
                  {activeControlCount}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          <Chip
            selected={isNovelScope}
            onClick={() => model.setSearchScope('novels')}
            className="inline-flex shrink-0 items-center gap-1.5"
          >
            <BookOpenText size={20} className="h-4 w-4" />
            {t('library.searchScope.novels')}
          </Chip>
          <Chip
            selected={!isNovelScope}
            onClick={() => model.setSearchScope('content')}
            className="inline-flex shrink-0 items-center gap-1.5"
          >
            <FileText size={20} className="h-4 w-4" />
            {t('library.searchScope.content')}
          </Chip>
        </div>
        {isNovelScope && model.activeFilterChips.length ? (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {model.activeFilterChips.map((chip) => (
              <Chip
                key={chip.id}
                selected
                onClick={chip.id === 'filter' ? model.clearFilter : model.clearSort}
              >
                {t(chip.labelKey as TranslationKey)}
                <X size={20} className="ml-1 h-4 w-4" />
              </Chip>
            ))}
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
          <div className="flex items-center justify-between gap-3 pt-2">
            <Text as="p" variant="supporting" tone="muted" className="font-semibold">
              {t('common.items', { count: model.total })}
            </Text>
          </div>

          {model.novels.isLoading ? (
            <LibrarySkeleton />
          ) : isEmpty ? (
            model.isSearchEmpty ? (
              <EmptyState
                title={t('library.empty.search', { query: model.keyword })}
                description={t('library.empty.searchDescription')}
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="secondary" onClick={() => model.setKeyword('')}>
                      {t('library.clearSearch')}
                    </Button>
                    <Button onClick={() => model.setSearchScope('content')}>
                      <FileText size={20} />
                      {t('library.searchInContent')}
                    </Button>
                  </div>
                }
              />
            ) : model.isFilterEmpty ? (
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
                  <Button onClick={addNovel.open}>
                    <BookPlus size={20} />
                    {t('library.importNovel')}
                  </Button>
                }
              />
            )
          ) : (
            <LibraryGrid
              novels={model.visibleItems}
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
        <LibraryContentSearch query={model.keyword} />
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
