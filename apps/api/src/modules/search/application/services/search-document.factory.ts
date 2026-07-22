import type { LibraryNovelDetail } from '../../../library/public/library.api.js';
import type { SearchDocument } from '../../domain/search.models.js';

interface SearchNovelSource {
  id: string;
  title: string;
  sourceName: string;
}

interface SearchChapterSource {
  id: string;
  novelId: string;
  index: number;
  title: string;
  rawText?: string;
  cleanText?: string;
  status: 'pending' | 'fetched' | 'failed';
  sourceAvailable: boolean;
}

export function novelSearchDocument(novel: SearchNovelSource): SearchDocument {
  return {
    type: 'novel',
    documentId: novel.id,
    novelId: novel.id,
    title: novel.title,
    subtitle: novel.sourceName,
    content: ''
  };
}

export function chapterSearchDocument(
  chapter: SearchChapterSource,
  novelTitle: string
): SearchDocument {
  return {
    type: 'chapter',
    documentId: chapter.id,
    novelId: chapter.novelId,
    chapterIndex: chapter.index,
    title: chapter.title,
    subtitle: novelTitle,
    content:
      chapter.sourceAvailable && chapter.status === 'fetched'
        ? (chapter.cleanText ?? chapter.rawText ?? '')
        : ''
  };
}

export function novelProjectionDocuments(detail: LibraryNovelDetail): SearchDocument[] {
  return [
    novelSearchDocument(detail.novel),
    ...detail.chapters
      .filter((chapter) => chapter.sourceAvailable)
      .map((chapter) => chapterSearchDocument(chapter, detail.novel.title))
  ];
}
