interface ReaderSource {
  pluginId: string;
  pluginVersion: string;
  domain: string;
  capability: string;
}

interface ReaderResult<T> {
  data: T;
  source: ReaderSource;
}

interface ReaderMetadata {
  title: string;
  sourceUrl: string;
  sourceName: string;
  author?: string;
  coverUrl?: string;
  description?: string;
  status?: 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';
}

interface ReaderChapterSummary {
  index: number;
  title: string;
  url: string;
  publishedAt?: string;
}

interface ReaderChapterContent {
  title: string;
  url: string;
  rawText: string;
  cleanText: string;
}

export interface CrawlerSourceReaderPort {
  readMetadata(request: {
    url: string;
    signal?: AbortSignal;
  }): Promise<ReaderResult<ReaderMetadata>>;
  streamChapterList(request: {
    url: string;
    batchSize?: number;
    signal?: AbortSignal;
  }): AsyncIterable<ReaderResult<ReaderChapterSummary[]>>;
  readChapterContent(request: {
    url: string;
    signal?: AbortSignal;
  }): Promise<ReaderResult<ReaderChapterContent>>;
}
