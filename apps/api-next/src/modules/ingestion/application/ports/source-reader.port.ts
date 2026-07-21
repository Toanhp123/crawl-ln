interface ReaderSource {
  pluginId: string;
  pluginVersion: string;
  domain: string;
}

interface ReaderResult<TData> {
  data: TData;
  source: ReaderSource;
}

export interface IngestionSourceMetadata {
  title: string;
  sourceUrl: string;
  sourceName: string;
  author?: string;
  coverUrl?: string;
}

export interface IngestionSourceChapter {
  index: number;
  title: string;
  url: string;
  publishedAt?: string;
}

export interface IngestionSourceChapterContent {
  title: string;
  url: string;
  rawText: string;
  cleanText: string;
}

export interface IngestionSourceReaderPort {
  readMetadata(request: {
    url: string;
    signal?: AbortSignal;
  }): Promise<ReaderResult<IngestionSourceMetadata>>;
  streamChapterList(request: {
    url: string;
    batchSize?: number;
    signal?: AbortSignal;
  }): AsyncIterable<ReaderResult<IngestionSourceChapter[]>>;
  readChapterContent(request: {
    url: string;
    signal?: AbortSignal;
  }): Promise<ReaderResult<IngestionSourceChapterContent>>;
}
