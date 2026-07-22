import type { ExportArtifact, ExportBook } from '../../domain/export.models.js';

export interface ExportWriterPort {
  write(book: ExportBook): Promise<ExportArtifact>;
}
