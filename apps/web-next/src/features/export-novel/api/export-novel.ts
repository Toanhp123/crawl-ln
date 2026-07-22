import type { ExportChapterRange, ExportFormat } from '@novel-tool/shared';
import { requestDownload, type DownloadArtifact, type FetchLike } from '../../../shared/api';

export interface ExportNovelInput {
  novelId: string;
  format: ExportFormat;
  range?: ExportChapterRange;
  downloadedOnly?: boolean;
  signal?: AbortSignal;
}

export function createExportClient(fetcher: FetchLike = fetch) {
  return {
    download(input: ExportNovelInput): Promise<DownloadArtifact> {
      const body = {
        format: input.format,
        ...(input.range ? { range: input.range } : {}),
        downloadedOnly: input.downloadedOnly ?? true
      };
      return requestDownload(
        fetcher,
        `/api/exports/novels/${encodeURIComponent(input.novelId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: input.signal
        },
        `novel.${input.format}`
      );
    }
  };
}

const exportClient = createExportClient();
export const exportNovel = exportClient.download;
