import type { ExportBook } from '../../domain/export.models.js';

export interface NovelExportSourcePort {
  load(novelId: string): Promise<ExportBook | null>;
}
