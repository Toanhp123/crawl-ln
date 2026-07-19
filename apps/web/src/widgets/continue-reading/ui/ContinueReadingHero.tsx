import type { Novel } from '@novel-tool/shared';
import { BookOpen, Clock3, Play } from 'lucide-react';
import type { ReadingHistoryEntry } from '@/features/read-chapter/model/readingContinuityStorage';
import { NovelCover } from '@/entities/novel/ui/NovelCover';
import { Button, Card, Progress, Text } from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';

export function ContinueReadingHero({
  readingHistory,
  novel,
  onOpen,
  onContinue
}: {
  readingHistory: ReadingHistoryEntry;
  novel: Novel;
  onOpen: () => void;
  onContinue: () => void;
}) {
  const { t, relativeTime, number } = useI18n();
  const progress = Math.max(
    0,
    Math.min(100, Math.round((readingHistory.bookProgress ?? readingHistory.scrollRatio) * 100))
  );
  return (
    <Card
      padding="lg"
      radius="xl"
      className="min-h-[13.5rem] overflow-hidden bg-[var(--gradient-primary-hero)]"
    >
      <div className="flex items-start gap-4">
        <NovelCover
          title={novel.title}
          coverUrl={novel.coverUrl}
          size="lg"
          className="w-20 sm:w-24"
        />
        <div className="min-w-0 flex-1">
          <Text variant="caption" tone="primary" className="font-extrabold uppercase tracking-wide">
            {t('library.continue')}
          </Text>
          <button
            type="button"
            onClick={onOpen}
            className="mt-1 block w-full text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <Text as="h2" variant="title" className="line-clamp-2">
              {novel.title}
            </Text>
          </button>
          <Text variant="supporting" tone="muted" className="mt-2 inline-flex items-center gap-1.5">
            <BookOpen size={15} />
            {t('common.chapter')} {readingHistory.chapterIndex}
          </Text>
          <div className="mt-3">
            <Progress value={progress} />
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <Text variant="caption" tone="muted">
                {t('reader.progressPercent', { value: number(progress) })}
              </Text>
              <Text variant="caption" tone="muted" className="inline-flex items-center gap-1">
                <Clock3 size={13} />
                {relativeTime(readingHistory.lastOpenedAt)}
              </Text>
            </div>
          </div>
        </div>
      </div>
      <Button className="mt-4 w-full" onClick={onContinue}>
        <Play size={17} fill="currentColor" />
        {t('library.continue')}
      </Button>
    </Card>
  );
}
