import { API_BASE_URL } from '../config/api';
import { ApiError, readApiError } from './errors';

export interface DownloadArtifact {
  filename: string;
  contentType: string;
  content: Uint8Array;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function decodeFilename(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function filenameFromContentDisposition(
  disposition: string | null,
  fallback: string
): string {
  const encoded = disposition?.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]?.trim();
  if (encoded) return decodeFilename(encoded.replace(/^"|"$/g, ''));
  const quoted = disposition?.match(/filename\s*=\s*"([^"]+)"/i)?.[1];
  if (quoted) return quoted;
  const plain = disposition?.match(/filename\s*=\s*([^;]+)/i)?.[1]?.trim();
  return plain?.replace(/^"|"$/g, '') || fallback;
}

export async function readDownloadArtifact(
  response: Response,
  fallbackFilename: string
): Promise<DownloadArtifact> {
  if (!response.ok) throw await readApiError(response);
  if (response.status === 204) {
    throw new ApiError('Expected a binary download but received HTTP 204', {
      status: response.status,
      code: 'INTERNAL_ERROR'
    });
  }
  const content = new Uint8Array(await response.arrayBuffer());
  if (content.byteLength === 0) {
    throw new ApiError('Expected a binary download but received an empty response', {
      status: response.status,
      code: 'INTERNAL_ERROR'
    });
  }
  return {
    filename: filenameFromContentDisposition(
      response.headers.get('content-disposition'),
      fallbackFilename
    ),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    content
  };
}

export async function requestDownload(
  fetcher: FetchLike,
  path: string,
  init: RequestInit,
  fallbackFilename: string
): Promise<DownloadArtifact> {
  return readDownloadArtifact(await fetcher(`${API_BASE_URL}${path}`, init), fallbackFilename);
}

export function saveDownloadArtifact(
  artifact: DownloadArtifact,
  environment: {
    createObjectURL(blob: Blob): string;
    revokeObjectURL(url: string): void;
    createAnchor(): Pick<HTMLAnchorElement, 'href' | 'download' | 'click'>;
    schedule(callback: () => void): void;
  } = {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement('a'),
    schedule: (callback) => window.setTimeout(callback, 0)
  }
): void {
  const content = artifact.content.buffer.slice(
    artifact.content.byteOffset,
    artifact.content.byteOffset + artifact.content.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([content], { type: artifact.contentType });
  const url = environment.createObjectURL(blob);
  const anchor = environment.createAnchor();
  anchor.href = url;
  anchor.download = artifact.filename;
  anchor.click();
  environment.schedule(() => environment.revokeObjectURL(url));
}
