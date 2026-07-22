import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/shared/i18n';
import { Button, Progress, Text } from '@/shared/ui';

export function ReaderBottomBar({
  chapterTitle,
  chapterPosition,
  chapterCount,
  chapterPercent,
  bookPercent,
  previous,
  next,
  onPrevious,
  onNext
}: {
  chapterTitle: string;
  chapterPosition: number;
  chapterCount: number;
  chapterPercent: number;
  bookPercent: number;
  previous: boolean;
  next: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t, number } = useI18n();
  return (
    <div className="mx-auto max-w-[var(--reader-content-max)] space-y-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <Text as="p" variant="label" truncate>
            {chapterTitle}
          </Text>
          <Text as="p" variant="caption" tone="muted" className="mt-0.5">
            {t('reader.chapterOf', {
              current: number(chapterPosition),
              total: number(chapterCount)
            })}
          </Text>
        </div>
        <div className="shrink-0 text-right">
          <Text as="p" variant="metricSm">
            {number(chapterPercent)}%
          </Text>
          <Text as="p" variant="caption" tone="muted">
            {t('reader.bookProgress', { value: number(bookPercent) })}
          </Text>
        </div>
      </div>
      <Progress value={chapterPercent} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={!previous} onClick={onPrevious}>
          <ChevronLeft size={20} />
          {t('reader.previous')}
        </Button>
        <Button disabled={!next} onClick={onNext}>
          {t('reader.next')}
          <ChevronRight size={20} />
        </Button>
      </div>
    </div>
  );
}
