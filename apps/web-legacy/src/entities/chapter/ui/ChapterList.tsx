import type { Chapter } from '@novel-tool/shared';
import { CheckCircle2, Clock3, Eye, LocateFixed, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  ListRow,
  Pagination,
  SearchInput,
  Surface,
  Text
} from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';

const PAGE_SIZE = 20;
function tone(status: string) {
  return status === 'fetched'
    ? ('success' as const)
    : status === 'failed'
      ? ('danger' as const)
      : ('neutral' as const);
}
function icon(status: string) {
  if (status === 'fetched') return <CheckCircle2 size={18} className="text-success" />;
  if (status === 'failed') return <XCircle size={18} className="text-danger" />;
  return <Clock3 size={18} className="text-muted" />;
}
function displayTitle(chapter: Chapter, chapterLabel: string) {
  const title = chapter.title?.trim();
  if (!title || /^(chapter|chap|chương)(?:\s+\d+)?$/i.test(title))
    return `${chapterLabel} ${chapter.index}`;
  return title;
}

export function ChapterList({
  chapters,
  onSelect,
  currentIndex,
  readChapterIds
}: {
  chapters: Chapter[];
  onSelect: (chapter: Chapter) => void;
  currentIndex?: number;
  readChapterIds?: ReadonlySet<string>;
}) {
  const { t, status, errorMessage } = useI18n();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [jumpValue, setJumpValue] = useState('');
  const filtered = useMemo(() => {
    const query = keyword.trim().toLocaleLowerCase();
    if (!query) return chapters;
    return chapters.filter(
      (chapter) =>
        displayTitle(chapter, t('common.chapter')).toLocaleLowerCase().includes(query) ||
        String(chapter.index).includes(query)
    );
  }, [chapters, keyword, t]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );
  useEffect(() => setPage(1), [keyword]);
  useEffect(() => setPage((current) => Math.min(current, totalPages)), [totalPages]);
  const jumpToChapter = () => {
    const requested = Number(jumpValue);
    if (!Number.isInteger(requested)) return;
    const chapter = chapters.find((item) => item.index === requested);
    if (!chapter) return;
    setKeyword('');
    setPage(Math.floor(chapters.indexOf(chapter) / PAGE_SIZE) + 1);
    window.requestAnimationFrame(() => onSelect(chapter));
  };

  if (!chapters.length)
    return <EmptyState title={t('chapters.empty')} description={t('chapters.emptyDescription')} />;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <SearchInput value={keyword} onChange={setKeyword} placeholder={t('chapters.search')} />
        <div className="flex gap-2">
          <Input
            aria-label={t('chapters.goTo')}
            inputMode="numeric"
            min="1"
            type="number"
            className="min-w-0 flex-1 sm:w-28"
            value={jumpValue}
            placeholder={t('chapters.goToPlaceholder')}
            onChange={(event) => setJumpValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') jumpToChapter();
            }}
          />
          <Button variant="secondary" onClick={jumpToChapter} disabled={!jumpValue}>
            <LocateFixed size={16} />
            <span className="hidden min-[420px]:inline">{t('chapters.goTo')}</span>
          </Button>
        </div>
      </div>
      <Text variant="caption" tone="muted" className="font-semibold">
        {t('common.items', { count: filtered.length })}
      </Text>
      {!filtered.length ? (
        <EmptyState
          title={t('chapters.noMatches')}
          description={t('chapters.noMatchesDescription')}
        />
      ) : (
        <>
          <Surface className="overflow-hidden p-0">
            {visible.map((chapter) => {
              const current = chapter.index === currentIndex;
              const hasRead = readChapterIds?.has(chapter.id) ?? false;
              return (
                <ListRow
                  key={`${chapter.index}-${chapter.sourceUrl}`}
                  id={`novel-detail-chapter-${chapter.index}`}
                  aria-current={current ? 'page' : undefined}
                  active={current}
                  divided
                  insetFocus
                  leading={
                    <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] bg-surface2">
                      {icon(chapter.status)}
                    </span>
                  }
                  title={displayTitle(chapter, t('common.chapter'))}
                  description={
                    <span className="flex items-center gap-2">
                      <span>
                        {t('common.chapter')} {chapter.index}
                      </span>
                      {hasRead ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-primary">
                          <Eye size={12} />
                          {t('reader.read')}
                        </span>
                      ) : null}
                    </span>
                  }
                  meta={
                    chapter.errorMessage ? (
                      <Text variant="caption" tone="danger" className="line-clamp-2">
                        {errorMessage(chapter.errorMessage)}
                      </Text>
                    ) : undefined
                  }
                  trailing={
                    <Badge
                      className="hidden min-h-7 px-2.5 py-0 min-[360px]:inline-flex"
                      tone={tone(chapter.status)}
                    >
                      {status(chapter.status)}
                    </Badge>
                  }
                  showChevron
                  onClick={() => onSelect(chapter)}
                />
              );
            })}
          </Surface>
          <Pagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
