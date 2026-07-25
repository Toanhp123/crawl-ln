import { ApiError } from '../../../shared/api';
import {
  appendRestoreChunk,
  getRestoreSession,
  type AppendRestoreChunkRequest,
  type RestoreSessionIdentity
} from '../api/backup-library';
import type {
  RestoreSessionAuthenticated,
  RestoreSessionState
} from './backup-operation-validation';

export const RESTORE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

export interface RestoreUploadClient {
  append(input: AppendRestoreChunkRequest): Promise<{
    receivedBytes: number;
    expectedBytes: number;
    state: RestoreSessionState;
  }>;
  read(
    input: RestoreSessionIdentity & { signal?: AbortSignal }
  ): Promise<RestoreSessionAuthenticated>;
}

export interface UploadRestoreFileInput {
  file: File;
  session: { id: string; token: string; receivedBytes: number; expectedBytes: number };
  onAcknowledgedProgress(receivedBytes: number): void;
  signal: AbortSignal;
}

const defaultClient: RestoreUploadClient = {
  append: appendRestoreChunk,
  read: getRestoreSession
};

function abortError(): Error {
  return new DOMException('Restore upload aborted', 'AbortError');
}

function authoritativeOffset(value: unknown, expectedBytes: number): number | null {
  if (!value || typeof value !== 'object') return null;
  const receivedBytes = (value as { receivedBytes?: unknown }).receivedBytes;
  return Number.isSafeInteger(receivedBytes) &&
    Number(receivedBytes) >= 0 &&
    Number(receivedBytes) <= expectedBytes
    ? Number(receivedBytes)
    : null;
}

export async function uploadRestoreFile(
  input: UploadRestoreFileInput,
  client: RestoreUploadClient = defaultClient
): Promise<{ receivedBytes: number; expectedBytes: number; state: RestoreSessionState }> {
  if (input.file.size !== input.session.expectedBytes) {
    throw new Error('Selected restore file size does not match the server session');
  }
  let offset = input.session.receivedBytes;
  let state: RestoreSessionState = offset === input.file.size ? 'uploaded' : 'uploading';

  while (offset < input.file.size) {
    if (input.signal.aborted) throw abortError();
    const end = Math.min(offset + RESTORE_UPLOAD_CHUNK_BYTES, input.file.size);
    try {
      const response = await client.append({
        id: input.session.id,
        token: input.session.token,
        offset,
        content: input.file.slice(offset, end),
        signal: input.signal
      });
      if (response.expectedBytes !== input.file.size || response.receivedBytes <= offset) {
        throw new Error('Restore upload returned a non-advancing or mismatched offset');
      }
      offset = response.receivedBytes;
      state = response.state;
      input.onAcknowledgedProgress(offset);
    } catch (error) {
      if (input.signal.aborted) throw abortError();
      if (error instanceof ApiError) {
        if (error.code !== 'OFFSET_MISMATCH') throw error;
        const serverOffset = authoritativeOffset(error.details, input.file.size);
        if (serverOffset === null) throw error;
        if (serverOffset !== offset) input.onAcknowledgedProgress(serverOffset);
        offset = serverOffset;
        continue;
      }
      if (!(error instanceof TypeError)) throw error;
      const session = await client.read({
        id: input.session.id,
        token: input.session.token,
        signal: input.signal
      });
      if (session.expectedBytes !== input.file.size) {
        throw new Error('Restore session size changed during upload');
      }
      if (session.receivedBytes !== offset) input.onAcknowledgedProgress(session.receivedBytes);
      offset = session.receivedBytes;
      state = session.state;
    }
  }

  return { receivedBytes: offset, expectedBytes: input.file.size, state };
}
