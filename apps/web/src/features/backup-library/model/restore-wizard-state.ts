import type { RestoreSessionAuthenticated } from './backup-operation-validation';
import type { RestoreSessionStorage } from './restore-session-storage';
import type { RestoreMode, SettingsMode } from './restore-validation';

export const RESTORE_WIZARD_STEPS = [
  'choose-file',
  'upload-validate',
  'inventory',
  'options',
  'impact',
  'confirmation',
  'progress',
  'result'
] as const;

export type RestoreWizardStep = (typeof RESTORE_WIZARD_STEPS)[number];
export type RestoreOperationState =
  'queued' | 'running' | 'succeeded' | 'failed' | 'interrupted' | 'cancelled';

export interface RestoreWizardState {
  step: RestoreWizardStep;
  session: RestoreSessionAuthenticated | null;
  sessionId: string | null;
  sessionToken: string | null;
  inspectionToken: string | null;
  operationId: string | null;
  operationState: RestoreOperationState | null;
  fingerprint: string | null;
  filename: string | null;
  size: number | null;
  pendingSettings: Record<string, unknown> | null;
  inventoryReviewed: boolean;
  planStale: boolean;
  replaceReloadedOperationId: string | null;
  mode: RestoreMode;
  settingsPolicy: SettingsMode;
  acknowledgedBytes: number;
}

export type RestoreWizardAction =
  | { type: 'restore-storage'; value: RestoreSessionStorage }
  | {
      type: 'session-created';
      sessionId: string;
      sessionToken: string;
      fingerprint: string;
      filename: string;
      size: number;
    }
  | { type: 'session-loaded'; session: RestoreSessionAuthenticated }
  | { type: 'upload-progress'; receivedBytes: number }
  | { type: 'inventory-reviewed' }
  | { type: 'options-changed'; mode: RestoreMode; settingsPolicy: SettingsMode }
  | {
      type: 'plan-created';
      inspectionToken: string;
      pendingSettings: Record<string, unknown> | null;
    }
  | { type: 'impact-reviewed' }
  | { type: 'operation-loaded'; operation: { id: string; state: RestoreOperationState } }
  | { type: 'operation-cleared' }
  | { type: 'plan-stale' }
  | { type: 'replace-reload-marked'; operationId: string }
  | { type: 'replace-reload-restored' }
  | { type: 'back' }
  | { type: 'reset' };

export function createRestoreWizardState(): RestoreWizardState {
  return {
    step: 'choose-file',
    session: null,
    sessionId: null,
    sessionToken: null,
    inspectionToken: null,
    operationId: null,
    operationState: null,
    fingerprint: null,
    filename: null,
    size: null,
    pendingSettings: null,
    inventoryReviewed: false,
    planStale: false,
    replaceReloadedOperationId: null,
    mode: 'merge',
    settingsPolicy: 'keep-current',
    acknowledgedBytes: 0
  };
}

const previousStep: Partial<Record<RestoreWizardStep, RestoreWizardStep>> = {
  'upload-validate': 'choose-file',
  inventory: 'upload-validate',
  options: 'inventory',
  impact: 'options',
  confirmation: 'impact'
};

function sessionStep(
  state: RestoreWizardState,
  session: RestoreSessionAuthenticated
): RestoreWizardStep {
  if (
    session.state === 'awaiting-password' ||
    ['uploading', 'uploaded', 'hashing', 'inspecting'].includes(session.state)
  )
    return 'upload-validate';
  if (session.state === 'ready') {
    if (state.planStale) return 'impact';
    if (session.mergePlan) {
      return state.step === 'confirmation' ? 'confirmation' : 'impact';
    }
    return state.inventoryReviewed ? 'options' : 'inventory';
  }
  if (session.state === 'locked') return 'progress';
  if (session.state === 'consumed') return 'result';
  return state.step;
}

export function restoreWizardReducer(
  state: RestoreWizardState,
  action: RestoreWizardAction
): RestoreWizardState {
  if (action.type === 'reset') return createRestoreWizardState();
  if (action.type === 'restore-storage') {
    return {
      ...state,
      step: action.value.step,
      sessionId: action.value.sessionId,
      sessionToken: action.value.sessionToken,
      inspectionToken: action.value.inspectionToken ?? null,
      operationId: action.value.operationId ?? null,
      fingerprint: action.value.fingerprint ?? null,
      filename: action.value.filename ?? null,
      size: action.value.size ?? null,
      pendingSettings: action.value.pendingSettings ?? null,
      replaceReloadedOperationId: action.value.replaceReloadedOperationId ?? null,
      mode: action.value.mode ?? state.mode,
      settingsPolicy: action.value.settingsPolicy ?? state.settingsPolicy,
      acknowledgedBytes: action.value.acknowledgedBytes ?? 0
    };
  }
  if (action.type === 'session-created') {
    return {
      ...createRestoreWizardState(),
      step: 'upload-validate',
      sessionId: action.sessionId,
      sessionToken: action.sessionToken,
      fingerprint: action.fingerprint,
      filename: action.filename,
      size: action.size
    };
  }
  if (action.type === 'session-loaded') {
    if (['expired', 'invalid', 'cancelled'].includes(action.session.state)) {
      return createRestoreWizardState();
    }
    return {
      ...state,
      session: action.session,
      sessionId: action.session.id,
      inspectionToken: action.session.inspectionToken ?? state.inspectionToken,
      operationId: action.session.lockedOperationId ?? state.operationId,
      mode: action.session.selectedMode ?? state.mode,
      settingsPolicy: action.session.settingsPolicy ?? state.settingsPolicy,
      acknowledgedBytes: action.session.receivedBytes,
      step: sessionStep(state, action.session)
    };
  }
  if (action.type === 'upload-progress') {
    return { ...state, acknowledgedBytes: action.receivedBytes };
  }
  if (action.type === 'inventory-reviewed') {
    return { ...state, inventoryReviewed: true, step: 'options' };
  }
  if (action.type === 'options-changed') {
    return {
      ...state,
      mode: action.mode,
      settingsPolicy: action.settingsPolicy,
      inspectionToken: null,
      pendingSettings: null,
      planStale: false
    };
  }
  if (action.type === 'plan-created') {
    return {
      ...state,
      step: 'impact',
      inspectionToken: action.inspectionToken,
      pendingSettings: action.pendingSettings,
      planStale: false
    };
  }
  if (action.type === 'impact-reviewed') return { ...state, step: 'confirmation' };
  if (action.type === 'operation-loaded') {
    const active = action.operation.state === 'queued' || action.operation.state === 'running';
    return {
      ...state,
      operationId: action.operation.id,
      operationState: action.operation.state,
      step: active ? 'progress' : 'result'
    };
  }
  if (action.type === 'operation-cleared') {
    return {
      ...state,
      operationId: null,
      operationState: null,
      step:
        state.session?.state === 'ready'
          ? state.session.mergePlan
            ? 'impact'
            : 'inventory'
          : state.step
    };
  }
  if (action.type === 'plan-stale') return { ...state, step: 'impact', planStale: true };
  if (action.type === 'replace-reload-marked') {
    return {
      ...state,
      operationId: action.operationId,
      step: 'result',
      replaceReloadedOperationId: action.operationId
    };
  }
  if (action.type === 'replace-reload-restored') {
    return { ...state, replaceReloadedOperationId: null };
  }
  if (action.type === 'back') {
    if (state.operationId || state.step === 'progress' || state.step === 'result') return state;
    return { ...state, step: previousStep[state.step] ?? state.step };
  }
  return state;
}
