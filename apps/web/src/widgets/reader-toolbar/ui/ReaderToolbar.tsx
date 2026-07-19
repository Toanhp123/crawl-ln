import { ArrowLeft, Bookmark, BookmarkCheck, List, SlidersHorizontal } from 'lucide-react';
import { IconButton, Toolbar } from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';

export function ReaderToolbar({
  title,
  progress,
  chapterPosition,
  chapterCount,
  bookmarked,
  onBack,
  onBookmark,
  onChapters,
  onPreferences
}: {
  title: string;
  progress: number;
  chapterPosition: number;
  chapterCount: number;
  bookmarked: boolean;
  onBack: () => void;
  onBookmark: () => void;
  onChapters: () => void;
  onPreferences: () => void;
}) {
  const { t, number } = useI18n();
  return (
    <header className="safe-top border-b border-border bg-[hsl(var(--color-bg-elevated)/.96)] backdrop-blur-xl">
      <Toolbar
        className="mx-auto max-w-[var(--reader-content-max)] border-b-0 bg-transparent px-2 backdrop-blur-none"
        leading={
          <IconButton onClick={onBack} aria-label={t('reader.backLibrary')} variant="ghost">
            <ArrowLeft size={20} />
          </IconButton>
        }
        title={title}
        description={t('reader.chapterPosition', {
          current: number(chapterPosition),
          total: number(chapterCount),
          progress: number(progress)
        })}
        actions={
          <>
            <IconButton
              onClick={onBookmark}
              aria-label={bookmarked ? t('reader.removeBookmark') : t('reader.addBookmark')}
              variant="ghost"
            >
              {bookmarked ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
            </IconButton>
            <IconButton onClick={onChapters} aria-label={t('reader.chapters')} variant="ghost">
              <List size={20} />
            </IconButton>
            <IconButton onClick={onPreferences} aria-label={t('settings.reader')} variant="ghost">
              <SlidersHorizontal size={20} />
            </IconButton>
          </>
        }
      />
    </header>
  );
}
