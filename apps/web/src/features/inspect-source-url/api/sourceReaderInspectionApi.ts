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
import type { SourceInspectionCommand } from '../model/sourceInspector';

const post = <T>(path: string, body: unknown) =>
  http<T>(path, { method: 'POST', body: JSON.stringify(body) });

const identifySource = (input: SourceReaderUrlRequest) =>
  post<SourceReaderResult<SourceReaderIdentity>>('/api/source-reader/identify', input);

const readSourceMetadata = (input: SourceReaderUrlRequest) =>
  post<SourceReaderResult<SourceReaderNovelMetadata>>('/api/source-reader/metadata', input);

const readSourceChapterList = (input: SourceReaderChapterListRequest) =>
  post<SourceReaderResult<SourceReaderPage<SourceReaderChapterSummary>>>(
    '/api/source-reader/chapter-list',
    input
  );

const readSourceChapterContent = (input: SourceReaderUrlRequest) =>
  post<SourceReaderResult<SourceReaderChapterContent>>('/api/source-reader/chapter-content', input);

const searchSource = (input: SourceReaderSearchRequest) =>
  post<SourceReaderResult<SourceReaderPage<SourceReaderNovelSearchResult>>>(
    '/api/source-reader/search',
    input
  );

const readSourceLatestUpdates = (input: SourceReaderChapterListRequest) =>
  post<SourceReaderResult<SourceReaderPage<SourceReaderLatestUpdate>>>(
    '/api/source-reader/latest-updates',
    input
  );

export async function runSourceInspection({
  operation,
  request
}: SourceInspectionCommand): Promise<SourceReaderResult<unknown>> {
  if (operation === 'identify') return identifySource(request);
  if (operation === 'metadata') return readSourceMetadata(request);
  if (operation === 'chapter-content') return readSourceChapterContent(request);
  if (operation === 'chapter-list')
    return readSourceChapterList(request as SourceReaderChapterListRequest);
  if (operation === 'latest-updates')
    return readSourceLatestUpdates(request as SourceReaderChapterListRequest);
  return searchSource(request as SourceReaderSearchRequest);
}
