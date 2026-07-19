import type { ExportBook } from '../../domain/export.js';
export interface NovelExportSourcePort {
  load(novelId: string): Promise<ExportBook | null>;
}
