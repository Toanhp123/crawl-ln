import type { Chapter } from '@novel-tool/shared';
import { BottomSheet } from '@/shared/ui';
import { ChapterList } from '@/entities/chapter/ui/ChapterList';
import { useI18n } from '@/shared/i18n/I18nProvider';

export function ChapterListSheet({
  open,
  onOpenChange,
  chapters,
  onSelect,
  currentIndex
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  chapters: Chapter[];
  onSelect: (index: number) => void;
  currentIndex?: number;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('reader.chapters')}
      description={t('reader.chaptersDescription')}
    >
      <ChapterList
        chapters={chapters}
        currentIndex={currentIndex}
        onSelect={(chapter) => {
          onSelect(chapter.index);
          onOpenChange(false);
        }}
      />
    </BottomSheet>
  );
}
