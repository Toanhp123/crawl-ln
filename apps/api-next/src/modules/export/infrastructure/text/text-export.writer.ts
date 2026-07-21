import type { ExportWriterPort } from '../../application/ports/export-writer.port.js';
import type { ExportBook } from '../../domain/export.models.js';
import { safeExportBaseName } from '../export-filename.js';

export class TextExportWriter implements ExportWriterPort {
  async write(book: ExportBook) {
    const lines = [
      book.novel.title,
      `Nguồn: ${book.novel.sourceUrl}`,
      '',
      '====================',
      '',
      ...book.chapters.flatMap((chapter) => [
        `${chapter.index}. ${chapter.title}`,
        '',
        chapter.cleanText || chapter.rawText || '',
        '',
        '====================',
        ''
      ])
    ];
    return {
      filename: `${safeExportBaseName(book.novel.title)}.txt`,
      contentType: 'text/plain; charset=utf-8',
      content: Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8'),
      chapterCount: book.chapters.length
    };
  }
}
