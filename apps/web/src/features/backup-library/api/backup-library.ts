import {
  readApiSuccess,
  requestDownload,
  type DownloadArtifact,
  type FetchLike
} from '../../../shared/api';
import { API_BASE_URL } from '../../../shared/config/api';
import type { RestoreMode, SettingsMode } from '../model/restore-validation';
import {
  validateCurrentRestoreSession,
  validateRestorePlanResponse,
  validateRestoreSessionCreate,
  validateRestoreSessionDetail,
  validateRestoreSessionPublic,
  validateRestoreUploadOffset
} from '../model/backup-operation-validation';

export interface CreateBackupInput {
  password?: string;
  settings?: Record<string, unknown>;
  signal?: AbortSignal;
}

export function createBackupClient(fetcher: FetchLike = fetch) {
  return {
    create(input: CreateBackupInput = {}): Promise<DownloadArtifact> {
      return requestDownload(
        fetcher,
        '/api/backups',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(input.password ? { password: input.password } : {}),
            ...(input.settings ? { settings: input.settings } : {})
          }),
          signal: input.signal
        },
        'novel-tool-backup.nvt'
      );
    }
  };
}

const backupClient = createBackupClient();
export const createLibraryBackup = backupClient.create;

export interface CreateRestoreSessionRequest {
  filename: string;
  size: number;
  fingerprint: `sha256-partial-v1:${string}`;
  replaceExisting: boolean;
  signal?: AbortSignal;
}

export interface RestoreSessionIdentity {
  id: string;
  token: string;
}
export interface AppendRestoreChunkRequest extends RestoreSessionIdentity {
  offset: number;
  content: Blob;
  signal?: AbortSignal;
}
export interface CreateRestorePlanRequest extends RestoreSessionIdentity {
  mode: RestoreMode;
  settingsPolicy: SettingsMode;
  signal?: AbortSignal;
}

export function createRestorePreparationClient(fetcher: FetchLike = fetch) {
  const json = async <T>(path: string, init: RequestInit, validate: (value: unknown) => T) =>
    validate(await readApiSuccess<unknown>(await fetcher(`${API_BASE_URL}${path}`, init)));

  return {
    create(input: CreateRestoreSessionRequest) {
      return json(
        '/api/backups/restore-sessions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: input.filename,
            size: input.size,
            fingerprint: input.fingerprint,
            replaceExisting: input.replaceExisting
          }),
          signal: input.signal
        },
        validateRestoreSessionCreate
      );
    },
    current(signal?: AbortSignal) {
      return json(
        '/api/backups/restore-sessions/current',
        { method: 'GET', signal },
        validateCurrentRestoreSession
      );
    },
    read(input: RestoreSessionIdentity & { signal?: AbortSignal }) {
      return json(
        `/api/backups/restore-sessions/${encodeURIComponent(input.id)}`,
        {
          method: 'GET',
          headers: { 'Session-Token': input.token },
          signal: input.signal
        },
        validateRestoreSessionDetail
      );
    },
    append(input: AppendRestoreChunkRequest) {
      return json(
        `/api/backups/restore-sessions/${encodeURIComponent(input.id)}/chunk`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Session-Token': input.token,
            'Upload-Offset': String(input.offset)
          },
          body: input.content,
          signal: input.signal
        },
        validateRestoreUploadOffset
      );
    },
    complete(input: RestoreSessionIdentity & { signal?: AbortSignal }) {
      return json(
        `/api/backups/restore-sessions/${encodeURIComponent(input.id)}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Session-Token': input.token },
          body: '{}',
          signal: input.signal
        },
        validateRestoreSessionDetail
      );
    },
    unlock(input: RestoreSessionIdentity & { password: string; signal?: AbortSignal }) {
      return json(
        `/api/backups/restore-sessions/${encodeURIComponent(input.id)}/unlock`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Session-Token': input.token },
          body: JSON.stringify({ password: input.password }),
          signal: input.signal
        },
        validateRestoreSessionDetail
      );
    },
    plan(input: CreateRestorePlanRequest) {
      return json(
        `/api/backups/restore-sessions/${encodeURIComponent(input.id)}/plan`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Session-Token': input.token },
          body: JSON.stringify({ mode: input.mode, settingsPolicy: input.settingsPolicy }),
          signal: input.signal
        },
        validateRestorePlanResponse
      );
    },
    touch(input: RestoreSessionIdentity & { signal?: AbortSignal }) {
      return json(
        `/api/backups/restore-sessions/${encodeURIComponent(input.id)}/touch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Session-Token': input.token },
          body: '{}',
          signal: input.signal
        },
        validateRestoreSessionDetail
      );
    },
    cancel(input: RestoreSessionIdentity & { signal?: AbortSignal }) {
      return json(
        `/api/backups/restore-sessions/${encodeURIComponent(input.id)}`,
        {
          method: 'DELETE',
          headers: { 'Session-Token': input.token },
          signal: input.signal
        },
        validateRestoreSessionPublic
      );
    }
  };
}

const restorePreparationClient = createRestorePreparationClient();
export const createRestoreSession = restorePreparationClient.create;
export const getCurrentRestoreSession = restorePreparationClient.current;
export const getRestoreSession = restorePreparationClient.read;
export const appendRestoreChunk = restorePreparationClient.append;
export const completeRestoreUpload = restorePreparationClient.complete;
export const unlockRestoreSession = restorePreparationClient.unlock;
export const createRestorePlan = restorePreparationClient.plan;
export const touchRestoreSession = restorePreparationClient.touch;
export const cancelRestoreSession = restorePreparationClient.cancel;
