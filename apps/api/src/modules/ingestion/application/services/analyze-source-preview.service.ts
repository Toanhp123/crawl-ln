import { IngestionError } from '../../domain/errors/ingestion.error.js';
import type { IngestionSourceReaderPort } from '../ports/source-reader.port.js';
import type { SourceResultPolicyService } from './source-result-policy.service.js';

const chapterBatchSize = 200;
const previewChapterCount = 3;

export interface AnalyzeSourceCommand {
  url: string;
}

export interface AnalyzeSourceResult {
  title: string;
  sourceUrl: string;
  sourceName: string;
  author?: string;
  coverUrl?: string;
  description?: string;
  status?: 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';
  chapters: Array<{ index: number; title: string; url: string }>;
  diagnostics: { chapterCount: number; firstChapterUrls: string[] };
}

export class AnalyzeSourcePreviewService {
  constructor(
    private readonly sourceReader: IngestionSourceReaderPort,
    private readonly sourcePolicy: SourceResultPolicyService
  ) {}

  async execute(command: AnalyzeSourceCommand): Promise<AnalyzeSourceResult> {
    const metadata = await this.sourceReader.readMetadata({ url: command.url });
    const chapters: AnalyzeSourceResult['chapters'] = [];
    for await (const batch of this.sourceReader.streamChapterList({
      url: metadata.data.sourceUrl,
      batchSize: chapterBatchSize
    })) {
      chapters.push(...batch.data);
    }
    if (chapters.length === 0) {
      throw IngestionError.validation('Analyze failed: source returned 0 chapters');
    }
    try {
      this.sourcePolicy.assertChapterHosts(metadata.data.sourceUrl, chapters);
    } catch (error) {
      if (error instanceof IngestionError) {
        throw IngestionError.validation(
          'Analyze failed: chapter URL is outside the source host',
          error.details
        );
      }
      throw error;
    }
    return {
      ...metadata.data,
      chapters,
      diagnostics: {
        chapterCount: chapters.length,
        firstChapterUrls: chapters.slice(0, previewChapterCount).map((chapter) => chapter.url)
      }
    };
  }
}
