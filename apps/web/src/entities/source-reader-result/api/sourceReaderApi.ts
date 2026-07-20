import type {
  SourceReaderChapterContent,
  SourceReaderChapterListRequest,
  SourceReaderChapterSummary,
  SourceReaderIdentity,
  SourceReaderLatestUpdate,
  SourceReaderNovelMetadata,
  SourceReaderNovelSearchResult,
  SourceReaderPage,
  SourceReaderResult,
  SourceReaderSearchRequest,
  SourceReaderUrlRequest
} from '@novel-tool/shared';
import { http } from '@/shared/api/http';
const post = <T>(path: string, body: unknown) =>
  http<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const identifySource = (input: SourceReaderUrlRequest) =>
  post<SourceReaderResult<SourceReaderIdentity>>('/api/source-reader/identify', input);
export const readSourceMetadata = (input: SourceReaderUrlRequest) =>
  post<SourceReaderResult<SourceReaderNovelMetadata>>('/api/source-reader/metadata', input);
export const readSourceChapterList = (input: SourceReaderChapterListRequest) =>
  post<SourceReaderResult<SourceReaderPage<SourceReaderChapterSummary>>>(
    '/api/source-reader/chapter-list',
    input
  );
export const readSourceChapterContent = (input: SourceReaderUrlRequest) =>
  post<SourceReaderResult<SourceReaderChapterContent>>('/api/source-reader/chapter-content', input);
export const searchSource = (input: SourceReaderSearchRequest) =>
  post<SourceReaderResult<SourceReaderPage<SourceReaderNovelSearchResult>>>(
    '/api/source-reader/search',
    input
  );
export const readSourceLatestUpdates = (input: SourceReaderChapterListRequest) =>
  post<SourceReaderResult<SourceReaderPage<SourceReaderLatestUpdate>>>(
    '/api/source-reader/latest-updates',
    input
  );
