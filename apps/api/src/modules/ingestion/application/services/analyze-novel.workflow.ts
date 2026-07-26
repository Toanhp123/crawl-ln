import type { LibraryCommands } from '../../../library/public/library.api.js';
import { IngestionError } from '../../domain/errors/ingestion.error.js';
import type { AnalyzeNovelCommand } from '../../public/ingestion.contracts.js';
import type { IngestionIdGeneratorPort } from '../ports/id-generator.port.js';
import type {
  IngestionSourceChapter,
  IngestionSourceReaderPort
} from '../ports/source-reader.port.js';
import type { SourceResultPolicyService } from './source-result-policy.service.js';

const chapterBatchSize = 200;

export class AnalyzeNovelWorkflow {
  constructor(
    private readonly sourceReader: IngestionSourceReaderPort,
    private readonly sourcePolicy: SourceResultPolicyService,
    private readonly library: LibraryCommands,
    private readonly ids: IngestionIdGeneratorPort
  ) {}

  async execute(command: AnalyzeNovelCommand) {
    const metadata = await this.sourceReader.readMetadata({ url: command.url });
    const chapters: IngestionSourceChapter[] = [];
    for await (const batch of this.sourceReader.streamChapterList({
      url: metadata.data.sourceUrl,
      batchSize: chapterBatchSize
    })) {
      chapters.push(...batch.data);
    }
    if (chapters.length === 0) {
      throw IngestionError.validation('Analyze failed: source returned 0 chapters');
    }
    this.sourcePolicy.assertChapterHosts(metadata.data.sourceUrl, chapters);

    return this.library.reconcileAnalysis({
      commandId: command.commandId,
      analyzedAt: command.requestedAt,
      novel: {
        id: this.ids.randomId(),
        title: metadata.data.title,
        sourceUrl: metadata.data.sourceUrl,
        sourceName: metadata.data.sourceName,
        author: metadata.data.author,
        coverUrl: metadata.data.coverUrl
      },
      chapters: chapters.map((chapter) => ({
        id: this.ids.randomId(),
        index: chapter.index,
        title: chapter.title,
        sourceUrl: chapter.url
      }))
    });
  }
}
