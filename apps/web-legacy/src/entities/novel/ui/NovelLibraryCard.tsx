import type { Novel } from '@novel-tool/shared';
import { AlertTriangle, BookOpen, Download, Play } from 'lucide-react';
import { Badge, Button, Card, Progress, Text } from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { NovelCover } from './NovelCover';

export type NovelReadingProgress = {
  chapterIndex: number;
  scrollRatio: number;
  lastOpenedAt: string;
  chapterPosition?: number;
  chapterCount?: number;
  bookProgress?: number;
};

function statusTone(status: Novel['status']) {
  return status === 'completed'
    ? ('success' as const)
    : status === 'failed'
      ? ('danger' as const)
      : status === 'crawling' || status === 'analyzed'
        ? ('warning' as const)
        : ('info' as const);
}

export function NovelLibraryCard({
  novel,
  readingProgress,
  onOpen,
  onRead,
  onContinueImport
}: {
  novel: Novel;
  readingProgress?: NovelReadingProgress;
  onOpen: () => void;
  onRead: (chapterIndex: number) => void;
  onContinueImport: () => void;
}) {
  const { t, status, number } = useI18n();
  const chapterCount = novel.chapterCount ?? 0;
  const fetchedChapterCount = novel.fetchedChapterCount ?? 0;
  const failedChapterCount = novel.failedChapterCount ?? 0;
  const displayChapterCount = chapterCount || fetchedChapterCount;
  const readingPercent = readingProgress
    ? Math.round(
        Math.max(
          0,
          Math.min(
            1,
            readingProgress.bookProgress ??
              ((readingProgress.chapterPosition ?? Math.max(0, readingProgress.chapterIndex - 1)) +
                readingProgress.scrollRatio) /
                Math.max(1, readingProgress.chapterCount ?? chapterCount)
          )
        ) * 100
      )
    : 0;
  const canRead = fetchedChapterCount > 0 && novel.firstChapterIndex !== undefined;
  const isImporting = novel.status === 'analyzed' || novel.status === 'crawling';
  const hasImportFailure = novel.status === 'failed' || failedChapterCount > 0;

  const action = readingProgress
    ? {
        label: t('library.continue'),
        icon: <Play size={15} fill="currentColor" />,
        onClick: () => onRead(readingProgress.chapterIndex)
      }
    : canRead
      ? {
          label: t('library.startReading'),
          icon: <BookOpen size={15} />,
          onClick: () => onRead(novel.firstChapterIndex!)
        }
      : isImporting || hasImportFailure
        ? {
            label: hasImportFailure ? t('library.viewError') : t('library.continueImport'),
            icon: hasImportFailure ? <AlertTriangle size={15} /> : <Download size={15} />,
            onClick: onContinueImport
          }
        : {
            label: t('library.openDetails'),
            icon: <BookOpen size={15} />,
            onClick: onOpen
          };

  return (
    <Card
      padding="none"
      radius="lg"
      interactive
      className="group flex h-full min-w-0 flex-col overflow-hidden"
    >
      <button
        type="button"
        onClick={onOpen}
        className="relative block aspect-[3/4] w-full overflow-hidden bg-surface2 text-left outline-none focus-visible:shadow-[var(--focus-ring)]"
        aria-label={novel.title}
      >
        <NovelCover
          title={novel.title}
          coverUrl={novel.coverUrl}
          className="h-full w-full rounded-none border-0 shadow-none transition-transform duration-[var(--motion-normal)] group-hover:scale-[1.025]"
        />
        {(isImporting || hasImportFailure) && (
          <Badge
            tone={statusTone(novel.status)}
            className="absolute left-2 top-2 max-w-[calc(100%-5rem)] truncate border border-white/20 shadow-[var(--elevation-1)] backdrop-blur-sm"
          >
            {status(novel.status)}
          </Badge>
        )}
        {displayChapterCount > 0 ? (
          <Badge
            tone="neutral"
            className="absolute right-2 top-2 border border-white/20 bg-[hsl(var(--color-bg-elevated)/.9)] shadow-[var(--elevation-1)] backdrop-blur-sm"
            aria-label={t('library.card.chapterCount', { count: number(displayChapterCount) })}
          >
            <BookOpen size={13} aria-hidden />
            {number(displayChapterCount)}
          </Badge>
        ) : null}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent opacity-70" />
      </button>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 text-left outline-none focus-visible:rounded-sm focus-visible:shadow-[var(--focus-ring)]"
        >
          <Text as="h3" variant="cardTitle" className="line-clamp-2">
            {novel.title}
          </Text>
        </button>

        {readingProgress ? (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <Text variant="caption" tone="muted">
                {t('library.card.readingProgress')}
              </Text>
              <Text variant="caption" className="font-semibold">
                {number(readingPercent)}%
              </Text>
            </div>
            <Progress value={readingPercent} label={t('library.card.readingProgress')} />
          </div>
        ) : null}

        <Button
          size="sm"
          variant={hasImportFailure ? 'secondary' : 'primary'}
          className="mt-3 w-full justify-center"
          onClick={action.onClick}
        >
          {action.icon}
          <span className="truncate">{action.label}</span>
        </Button>
      </div>
    </Card>
  );
}
