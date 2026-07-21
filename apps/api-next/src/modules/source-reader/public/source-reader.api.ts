import type {
  ChapterContent,
  ChapterSummary,
  IdentifyRequest,
  LatestUpdate,
  LatestUpdatesRequest,
  NovelMetadata,
  NovelSearchResult,
  Page,
  ReadChapterContentRequest,
  ReadChapterListRequest,
  ReadMetadataRequest,
  SearchSourceRequest,
  SourceIdentity,
  SourceReaderResult,
  StreamChapterListRequest
} from './source-reader.models.js';

export interface SourceReaderApi {
  identify(request: IdentifyRequest): Promise<SourceReaderResult<SourceIdentity>>;
  readMetadata(request: ReadMetadataRequest): Promise<SourceReaderResult<NovelMetadata>>;
  readChapterList(
    request: ReadChapterListRequest
  ): Promise<SourceReaderResult<Page<ChapterSummary>>>;
  streamChapterList(
    request: StreamChapterListRequest
  ): AsyncIterable<SourceReaderResult<ChapterSummary[]>>;
  readChapterContent(
    request: ReadChapterContentRequest
  ): Promise<SourceReaderResult<ChapterContent>>;
  search(request: SearchSourceRequest): Promise<SourceReaderResult<Page<NovelSearchResult>>>;
  latestUpdates(request: LatestUpdatesRequest): Promise<SourceReaderResult<Page<LatestUpdate>>>;
}

export type * from './source-reader.models.js';
