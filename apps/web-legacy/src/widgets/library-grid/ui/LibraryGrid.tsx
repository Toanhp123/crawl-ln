import type { Novel } from '@novel-tool/shared';
import { NovelLibraryCard, type NovelReadingProgress } from '@/entities/novel';

export function LibraryGrid({
  novels,
  readingByNovel,
  onOpen,
  onRead,
  onContinueImport
}: {
  novels: Novel[];
  readingByNovel: ReadonlyMap<string, NovelReadingProgress>;
  onOpen: (novelId: string) => void;
  onRead: (novelId: string, chapterIndex: number) => void;
  onContinueImport: (novelId: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {novels.map((novel) => (
        <NovelLibraryCard
          key={novel.id}
          novel={novel}
          readingProgress={readingByNovel.get(novel.id)}
          onOpen={() => onOpen(novel.id)}
          onRead={(chapterIndex) => onRead(novel.id, chapterIndex)}
          onContinueImport={() => onContinueImport(novel.id)}
        />
      ))}
    </div>
  );
}
