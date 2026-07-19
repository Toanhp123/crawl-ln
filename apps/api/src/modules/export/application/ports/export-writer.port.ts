import type { ExportArtifact, ExportBook } from '../../domain/export.js';
export interface ExportWriterPort {
  write(book: ExportBook): Promise<ExportArtifact>;
}
