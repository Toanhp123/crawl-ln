import type { SourceReaderResult } from '@novel-tool/shared';
export function sourceReaderResultJson(result: SourceReaderResult<unknown>) {
  return JSON.stringify(result, null, 2);
}
