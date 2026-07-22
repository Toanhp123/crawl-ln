import type { LibraryQueries } from '../../../library/public/library.api.js';
import type { NovelExportSourcePort } from '../../application/ports/novel-export-source.port.js';
import type { ExportBook } from '../../domain/export.models.js';

export class LibraryQueryNovelExportSourceAdapter implements NovelExportSourcePort {
  constructor(private readonly library: LibraryQueries) {}

  async load(novelId: string): Promise<ExportBook | null> {
    const detail = await this.library.getNovel(novelId);
    return detail ? { novel: detail.novel, chapters: detail.chapters } : null;
  }
}
