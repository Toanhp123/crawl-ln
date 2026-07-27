import type { Chapter } from '../../../entities/chapter';
import { ChapterList } from '../../../entities/chapter';
import { useI18n } from '../../../shared/i18n';
import { Drawer } from '../../../shared/ui';

export function ChapterListSheet({
  open,
  onOpenChange,
  chapters,
  onSelect,
  currentIndex,
  readChapterIds
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  chapters: Chapter[];
  onSelect: (index: number) => void;
  currentIndex?: number;
  readChapterIds?: ReadonlySet<string>;
}) {
  const { t } = useI18n();
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={t('reader.chapters')}
      description={t('reader.chaptersDescription')}
    >
      <ChapterList
        chapters={chapters}
        currentIndex={currentIndex}
        readChapterIds={readChapterIds}
        onSelect={(chapter) => {
          onSelect(chapter.index);
          onOpenChange(false);
        }}
      />
    </Drawer>
  );
}
