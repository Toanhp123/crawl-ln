import type { Chapter } from '../api/chapter-api';
import { EmptyState } from '../../../shared/ui';
import { useI18n } from '../../../shared/i18n';
import { paragraphDomId } from '../lib/paragraph-dom-id';

function displayTitle(chapter: Chapter, chapterLabel: string) {
  const title = chapter.title?.trim();
  return !title || /^(chapter|chap|chương)(?:\s+\d+)?$/i.test(title)
    ? `${chapterLabel} ${chapter.index}`
    : title;
}

export function splitChapterParagraphs(content: string) {
  return content
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function estimateReadingMinutes(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

export function ChapterReader({
  chapter
}: {
  chapter: Chapter | null | undefined;
  onClose?: () => void;
}) {
  const { t, number } = useI18n();
  if (!chapter) return null;
  const paragraphs = chapter.cleanText ? splitChapterParagraphs(chapter.cleanText) : [];
  const minutes = chapter.cleanText ? estimateReadingMinutes(chapter.cleanText) : 0;

  return (
    <div
      id={`reader-chapter-${chapter.index}`}
      data-reader-chapter={chapter.index}
      className="mx-auto max-w-[var(--reader-max)] pb-10"
    >
      <header className="border-b border-border pb-5 pt-2">
        <p className="type-eyebrow text-primary">
          {t('common.chapter')} {number(chapter.index)}
        </p>
        <h1 className="type-reader-title mt-2 break-words text-text">
          {displayTitle(chapter, t('common.chapter'))}
        </h1>
        {minutes > 0 && (
          <p className="mt-3 type-caption text-muted">
            {t('reader.minutes', { count: number(minutes) })}
          </p>
        )}
      </header>
      {paragraphs.length ? (
        <article
          className="reader-content mt-7 grid break-words text-secondary"
          style={{ gap: 'var(--reader-paragraph-gap)' }}
        >
          {paragraphs.map((paragraph, index) => (
            <p
              id={paragraphDomId(chapter.index, index)}
              data-reader-paragraph
              data-paragraph-index={index}
              key={`${chapter.index}-${index}`}
              className="scroll-mt-24 whitespace-pre-wrap"
            >
              {paragraph}
            </p>
          ))}
        </article>
      ) : (
        <div className="mt-6">
          <EmptyState
            title={t('chapters.noContent')}
            description={t('chapters.noContentDescription')}
          />
        </div>
      )}
    </div>
  );
}
