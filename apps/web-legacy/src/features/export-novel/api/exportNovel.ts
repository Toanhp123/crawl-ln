import { API_BASE_URL } from '@/shared/config/api';
import { readApiError } from '@/shared/api/errors';

export type ExportNovelOptions = {
  format: 'epub' | 'txt';
  range?: { from?: number; to?: number };
  downloadedOnly: boolean;
};

export async function exportNovelFile(
  novelId: string,
  options: ExportNovelOptions,
  signal?: AbortSignal
) {
  const response = await fetch(
    `${API_BASE_URL}/api/exports/novels/${encodeURIComponent(novelId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
      signal
    }
  );
  if (!response.ok) throw await readApiError(response);
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = disposition.match(/filename=\"([^\"]+)\"/)?.[1] ?? `novel.${options.format}`;
  return { blob: await response.blob(), filename };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
