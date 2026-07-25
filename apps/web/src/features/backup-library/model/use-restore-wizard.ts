import { useQueryClient } from '@tanstack/react-query';
import type {
  BackupCurrentOperationResult,
  BackupOperationSummary,
  StartRestoreOperationRequest
} from '@novel-tool/shared';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { backupOperationKeys } from '../../../entities/backup-operation';
import { ApiError } from '../../../shared/api';
import { useConnectionStatus } from '../../../shared/realtime';
import {
  cancelRestoreSession,
  completeRestoreUpload,
  createRestorePlan,
  createRestoreSession,
  getCurrentRestoreSession,
  getRestoreSession,
  touchRestoreSession,
  unlockRestoreSession
} from '../api/backup-library';
import { startRestoreOperation } from '../api/backup-operation-commands';
import type { RestoreMode, SettingsMode } from './restore-validation';
import { computeRestoreFileFingerprint } from './file-fingerprint';
import { uploadRestoreFile } from './resumable-upload';
import {
  clearStoredRestoreSession,
  readStoredRestoreSession,
  writeStoredRestoreSession,
  type RestoreSessionStorage
} from './restore-session-storage';
import {
  createRestoreWizardState,
  restoreWizardReducer,
  type RestoreOperationState
} from './restore-wizard-state';
import {
  createBackupIdempotencyKey,
  operationFromActiveConflictDetails,
  validateBackupOperation
} from './backup-operation-validation';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1_000;
export const MAX_RESTORE_FILE_BYTES = 512 * 1024 * 1024;

export interface UseRestoreWizardOptions {
  visible?: boolean;
  storage?: Storage;
}

function storedValue(
  state: ReturnType<typeof createRestoreWizardState>
): RestoreSessionStorage | null {
  if (!state.sessionId || !state.sessionToken) return null;
  return {
    version: 1,
    sessionId: state.sessionId,
    sessionToken: state.sessionToken,
    ...(state.inspectionToken ? { inspectionToken: state.inspectionToken } : {}),
    ...(state.operationId ? { operationId: state.operationId } : {}),
    step: state.step,
    ...(state.fingerprint ? { fingerprint: state.fingerprint } : {}),
    ...(state.filename ? { filename: state.filename } : {}),
    ...(state.size ? { size: state.size } : {}),
    ...(state.pendingSettings ? { pendingSettings: state.pendingSettings } : {}),
    ...(state.replaceReloadedOperationId
      ? { replaceReloadedOperationId: state.replaceReloadedOperationId }
      : {}),
    mode: state.mode,
    settingsPolicy: state.settingsPolicy,
    acknowledgedBytes: state.acknowledgedBytes
  };
}

export function useRestoreWizard(options: UseRestoreWizardOptions = {}) {
  const visible = options.visible ?? true;
  const client = useQueryClient();
  const connectionState = useConnectionStatus();
  const initialStored = useRef(readStoredRestoreSession(options.storage));
  const initialReloadGuard = useRef(initialStored.current?.replaceReloadedOperationId ?? null);
  const [state, dispatch] = useReducer(restoreWizardReducer, undefined, () =>
    initialStored.current
      ? restoreWizardReducer(createRestoreWizardState(), {
          type: 'restore-storage',
          value: initialStored.current
        })
      : createRestoreWizardState()
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const lastHeartbeatAt = useRef(0);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const value = storedValue(state);
    if (!value) clearStoredRestoreSession(options.storage);
    else writeStoredRestoreSession(value, options.storage);
  }, [options.storage, state]);

  const refresh = useCallback(async () => {
    if (!state.sessionId || !state.sessionToken) return null;
    const session = await getRestoreSession({ id: state.sessionId, token: state.sessionToken });
    dispatch({ type: 'session-loaded', session });
    return session;
  }, [state.sessionId, state.sessionToken]);

  useEffect(() => {
    if (!visible || !state.sessionId || !state.sessionToken || typeof document === 'undefined')
      return;
    let stopped = false;
    const heartbeat = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastHeartbeatAt.current < HEARTBEAT_INTERVAL_MS) return;
      lastHeartbeatAt.current = now;
      try {
        const session = await touchRestoreSession({
          id: state.sessionId!,
          token: state.sessionToken!
        });
        if (!stopped) dispatch({ type: 'session-loaded', session });
      } catch {
        /* authoritative actions surface errors */
      }
    };
    const onVisibilityChange = () => void heartbeat();
    document.addEventListener('visibilitychange', onVisibilityChange);
    const timer = window.setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(timer);
    };
  }, [visible, state.sessionId, state.sessionToken]);

  useEffect(() => {
    const activePreparation =
      state.session &&
      ['uploading', 'uploaded', 'hashing', 'awaiting-password', 'inspecting', 'ready'].includes(
        state.session.state
      );
    if (!visible || !activePreparation || connectionState === 'connected') return;
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 1_000);
    return () => window.clearInterval(timer);
  }, [connectionState, refresh, state.session, visible]);

  const chooseFile = useCallback(
    async (file: File, replaceExisting = false, signal?: AbortSignal) => {
      if (file.size <= 0 || file.size > MAX_RESTORE_FILE_BYTES) {
        throw new Error('Restore file must be between 1 byte and 512 MiB');
      }
      setBusy(true);
      setError(null);
      try {
        const fingerprint = await computeRestoreFileFingerprint(file);
        const created = await createRestoreSession({
          filename: file.name,
          size: file.size,
          fingerprint,
          replaceExisting,
          signal
        });
        setSelectedFile(file);
        idempotencyKey.current = null;
        dispatch({
          type: 'session-created',
          sessionId: created.sessionId,
          sessionToken: created.sessionToken,
          fingerprint,
          filename: file.name,
          size: file.size
        });
        return created;
      } catch (caught) {
        setError(caught);
        throw caught;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const reselectFile = useCallback(
    async (file: File) => {
      if (!state.fingerprint || file.size !== state.size) return false;
      const fingerprint = await computeRestoreFileFingerprint(file);
      if (fingerprint !== state.fingerprint) return false;
      setSelectedFile(file);
      return true;
    },
    [state.fingerprint, state.size]
  );

  const upload = useCallback(
    async (signal: AbortSignal) => {
      if (!selectedFile || !state.sessionId || !state.sessionToken) {
        throw new Error('Restore file and authenticated session are required');
      }
      setBusy(true);
      setError(null);
      try {
        const result = await uploadRestoreFile({
          file: selectedFile,
          session: {
            id: state.sessionId,
            token: state.sessionToken,
            receivedBytes: state.session?.receivedBytes ?? state.acknowledgedBytes,
            expectedBytes: selectedFile.size
          },
          onAcknowledgedProgress(receivedBytes) {
            dispatch({ type: 'upload-progress', receivedBytes });
          },
          signal
        });
        const session = await completeRestoreUpload({
          id: state.sessionId,
          token: state.sessionToken,
          signal
        });
        dispatch({ type: 'session-loaded', session });
        return result;
      } catch (caught) {
        setError(caught);
        throw caught;
      } finally {
        setBusy(false);
      }
    },
    [selectedFile, state.acknowledgedBytes, state.session, state.sessionId, state.sessionToken]
  );

  const unlock = useCallback(
    async (password: string, signal?: AbortSignal) => {
      if (!state.sessionId || !state.sessionToken) throw new Error('Restore session is required');
      setBusy(true);
      setError(null);
      try {
        const session = await unlockRestoreSession({
          id: state.sessionId,
          token: state.sessionToken,
          password,
          signal
        });
        dispatch({ type: 'session-loaded', session });
        return session;
      } catch (caught) {
        setError(caught);
        if (caught instanceof ApiError && caught.code === 'BACKUP_PASSWORD_INVALID') {
          if (caught.status === 410) {
            setSelectedFile(null);
            dispatch({ type: 'reset' });
            clearStoredRestoreSession(options.storage);
          } else {
            await refresh().catch(() => undefined);
          }
        }
        throw caught;
      } finally {
        setBusy(false);
      }
    },
    [refresh, state.sessionId, state.sessionToken]
  );

  const setOptions = useCallback((mode: RestoreMode, settingsPolicy: SettingsMode) => {
    idempotencyKey.current = null;
    dispatch({ type: 'options-changed', mode, settingsPolicy });
  }, []);

  const createPlan = useCallback(
    async (mode: RestoreMode, settingsPolicy: SettingsMode, signal?: AbortSignal) => {
      if (!state.sessionId || !state.sessionToken) throw new Error('Restore session is required');
      setOptions(mode, settingsPolicy);
      setBusy(true);
      setError(null);
      try {
        const response = await createRestorePlan({
          id: state.sessionId,
          token: state.sessionToken,
          mode,
          settingsPolicy,
          signal
        });
        dispatch({ type: 'session-loaded', session: response });
        dispatch({
          type: 'plan-created',
          inspectionToken: response.inspectionToken,
          pendingSettings: response.pendingSettings
        });
        return response;
      } catch (caught) {
        setError(caught);
        throw caught;
      } finally {
        setBusy(false);
      }
    },
    [setOptions, state.sessionId, state.sessionToken]
  );

  const replan = useCallback(
    async (signal?: AbortSignal) => {
      dispatch({ type: 'operation-cleared' });
      dispatch({ type: 'plan-stale' });
      await refresh();
      return createPlan(state.mode, state.settingsPolicy, signal);
    },
    [createPlan, refresh, state.mode, state.settingsPolicy]
  );

  const setCurrentOperation = useCallback(
    (operation: BackupOperationSummary) => {
      client.setQueryData<BackupCurrentOperationResult>(backupOperationKeys.current(), {
        operation
      });
      client.setQueryData(backupOperationKeys.detail(operation.id), operation);
      dispatch({
        type: 'operation-loaded',
        operation: { id: operation.id, state: operation.state }
      });
    },
    [client]
  );

  const startRestore = useCallback(
    async (
      confirmation: StartRestoreOperationRequest['confirmation'],
      currentSettings: Record<string, unknown>,
      signal?: AbortSignal
    ) => {
      if (
        !state.sessionId ||
        !state.sessionToken ||
        !state.inspectionToken ||
        !state.session?.mergePlanFingerprint
      ) {
        throw new Error('A reviewed Restore plan is required');
      }
      const key = idempotencyKey.current ?? createBackupIdempotencyKey();
      idempotencyKey.current = key;
      setBusy(true);
      setError(null);
      try {
        const operation = validateBackupOperation(
          await startRestoreOperation(
            state.sessionId,
            state.sessionToken,
            {
              inspectionToken: state.inspectionToken,
              planFingerprint: state.session.mergePlanFingerprint,
              confirmation,
              currentSettings
            },
            key,
            signal
          )
        );
        setCurrentOperation(operation);
        return operation;
      } catch (caught) {
        setError(caught);
        if (caught instanceof ApiError && caught.code === 'BACKUP_OPERATION_ACTIVE') {
          const operation = operationFromActiveConflictDetails(caught.details);
          if (operation) setCurrentOperation(operation);
        }
        throw caught;
      } finally {
        setBusy(false);
      }
    },
    [setCurrentOperation, state.inspectionToken, state.session, state.sessionId, state.sessionToken]
  );

  const recover = useCallback(async () => {
    const current = await getCurrentRestoreSession();
    if (!current.session) {
      if (state.sessionId && !state.operationId) {
        dispatch({ type: 'reset' });
        clearStoredRestoreSession(options.storage);
      }
      return current;
    }
    if (state.sessionId && current.session.id === state.sessionId) await refresh();
    return current;
  }, [options.storage, refresh, state.operationId, state.sessionId]);

  const retryPreparation = useCallback(async () => {
    if (!state.sessionId || !state.sessionToken) return null;
    setBusy(true);
    setError(null);
    try {
      const session = await refresh();
      dispatch({ type: 'operation-cleared' });
      return session;
    } catch (caught) {
      setError(caught);
      throw caught;
    } finally {
      setBusy(false);
    }
  }, [refresh, state.sessionId, state.sessionToken]);

  const cancel = useCallback(async () => {
    if (!state.sessionId || !state.sessionToken) return null;
    const session = await cancelRestoreSession({ id: state.sessionId, token: state.sessionToken });
    setSelectedFile(null);
    dispatch({ type: 'reset' });
    clearStoredRestoreSession(options.storage);
    return session;
  }, [options.storage, state.sessionId, state.sessionToken]);

  const prepareReplaceReload = useCallback(
    (operationId: string): boolean => {
      if (initialReloadGuard.current === operationId) {
        dispatch({ type: 'replace-reload-restored' });
        return false;
      }
      initialReloadGuard.current = operationId;
      dispatch({ type: 'replace-reload-marked', operationId });
      const value = storedValue({
        ...state,
        operationId,
        step: 'result',
        replaceReloadedOperationId: operationId
      });
      if (value) writeStoredRestoreSession(value, options.storage);
      return true;
    },
    [options.storage, state]
  );

  return {
    state,
    selectedFile,
    busy,
    error,
    connectionState,
    chooseFile,
    reselectFile,
    upload,
    refresh,
    recover,
    unlock,
    createPlan,
    setOptions,
    startRestore,
    retryPreparation,
    replan,
    cancel,
    reviewInventory: () => dispatch({ type: 'inventory-reviewed' }),
    reviewImpact: () => dispatch({ type: 'impact-reviewed' }),
    markPlanStale: () => dispatch({ type: 'plan-stale' }),
    back: () => dispatch({ type: 'back' }),
    reset: () => {
      setSelectedFile(null);
      dispatch({ type: 'reset' });
      clearStoredRestoreSession(options.storage);
    },
    setOperation: (operation: { id: string; state: RestoreOperationState }) =>
      dispatch({ type: 'operation-loaded', operation }),
    prepareReplaceReload
  };
}

export type RestoreWizardController = ReturnType<typeof useRestoreWizard>;
