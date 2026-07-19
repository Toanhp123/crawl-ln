import type { ExportWriterPort } from '../../application/ports/export-writer.port.js';
import type { ExportBook } from '../../domain/export.js';
function safeName(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'novel'
  );
}
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
    const content = Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8');
    return {
      filename: `${safeName(book.novel.title)}.txt`,
      contentType: 'text/plain; charset=utf-8',
      content,
      chapterCount: book.chapters.length
    };
  }
}
