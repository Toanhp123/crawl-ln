import { ExportConflictError, ExportNotFoundError } from '../../domain/export.error.js';
import type { ExportArtifact, ExportOptions } from '../../domain/export.models.js';
import type { ExportWriterPort } from '../ports/export-writer.port.js';
import type { NovelExportSourcePort } from '../ports/novel-export-source.port.js';

const defaultMaxExportSourceBytes = 128 * 1024 * 1024;

export function estimateExportSourceBytes(
  chapters: ReadonlyArray<{ title: string; cleanText?: string; rawText?: string }>
): number {
  return chapters.reduce(
    (total, chapter) =>
      total +
      Buffer.byteLength(chapter.title, 'utf8') +
      Buffer.byteLength(chapter.cleanText || chapter.rawText || '', 'utf8'),
    0
  );
}

export class ExportPipelineService {
  constructor(
    private readonly source: NovelExportSourcePort,
    private readonly writers: Record<'epub' | 'txt', ExportWriterPort>,
    private readonly maxSourceBytes = defaultMaxExportSourceBytes
  ) {}

  async execute(novelId: string, options: ExportOptions): Promise<ExportArtifact> {
    const book = await this.source.load(novelId);
    if (!book) throw new ExportNotFoundError('Novel not found');
    const chapters = book.chapters
      .filter((chapter) => !options.downloadedOnly || chapter.status === 'fetched')
      .filter((chapter) => options.range?.from === undefined || chapter.index >= options.range.from)
      .filter((chapter) => options.range?.to === undefined || chapter.index <= options.range.to)
      .sort((left, right) => left.index - right.index);
    if (chapters.length === 0) {
      throw new ExportConflictError('No chapters match the export options');
    }
    const sourceBytes = estimateExportSourceBytes(chapters);
    if (sourceBytes > this.maxSourceBytes) {
      throw new ExportConflictError(
        `Export is too large (${sourceBytes} bytes; limit ${this.maxSourceBytes} bytes)`
      );
    }
    return this.writers[options.format].write({ novel: book.novel, chapters });
  }
}
