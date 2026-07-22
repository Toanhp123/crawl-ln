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
import { http } from '../../../shared/api';
import type { SourceInspectionCommand } from '../model/source-inspector';
const post = <T>(path: string, body: unknown) =>
  http<T>(path, { method: 'POST', body: JSON.stringify(body) });
export async function runSourceInspection({
  operation,
  request
}: SourceInspectionCommand): Promise<SourceReaderResult<unknown>> {
  if (operation === 'identify')
    return post<SourceReaderResult<SourceReaderIdentity>>(
      '/api/source-reader/identify',
      request as SourceReaderUrlRequest
    );
  if (operation === 'metadata')
    return post<SourceReaderResult<SourceReaderNovelMetadata>>(
      '/api/source-reader/metadata',
      request as SourceReaderUrlRequest
    );
  if (operation === 'chapter-content')
    return post<SourceReaderResult<SourceReaderChapterContent>>(
      '/api/source-reader/chapter-content',
      request as SourceReaderUrlRequest
    );
  if (operation === 'chapter-list')
    return post<SourceReaderResult<SourceReaderPage<SourceReaderChapterSummary>>>(
      '/api/source-reader/chapter-list',
      request as SourceReaderChapterListRequest
    );
  if (operation === 'latest-updates')
    return post<SourceReaderResult<SourceReaderPage<SourceReaderLatestUpdate>>>(
      '/api/source-reader/latest-updates',
      request as SourceReaderChapterListRequest
    );
  return post<SourceReaderResult<SourceReaderPage<SourceReaderNovelSearchResult>>>(
    '/api/source-reader/search',
    request as SourceReaderSearchRequest
  );
}
