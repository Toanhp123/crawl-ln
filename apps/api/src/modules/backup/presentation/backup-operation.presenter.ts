import type { BackupOperationSummary } from '@novel-tool/shared';
import type { BackupOperationView } from '../public/backup.api.js';

function errorDetails(operation: BackupOperationView): BackupOperationSummary['error'] {
  if (!operation.errorCode) return null;
  const source = operation.errorDetails ?? {};
  const { retryable, ...details } = source;
  return {
    code: operation.errorCode,
    retryable: retryable === true,
    details: Object.keys(details).length > 0 ? details : null
  };
}

function safeCount(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

function restoreImpact(
  value: unknown
): NonNullable<BackupOperationSummary['result']>['impact'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const requiredKeys = [
    'novelsNew',
    'novelsExisting',
    'chaptersAdded',
    'chaptersSkipped',
    'sourceRemaps',
    'tasksRestored',
    'schedulerPoliciesRestored',
    'searchDocumentsRebuilt'
  ] as const;
  const required = Object.fromEntries(
    requiredKeys.map((key) => [key, safeCount(source[key])])
  ) as Record<(typeof requiredKeys)[number], number | undefined>;
  if (requiredKeys.some((key) => required[key] === undefined)) return undefined;
  const settingsOutcome = source.settingsOutcome;
  if (settingsOutcome !== 'keep-current' && settingsOutcome !== 'use-backup') return undefined;

  const impact: NonNullable<NonNullable<BackupOperationSummary['result']>['impact']> = {
    novelsNew: required.novelsNew!,
    novelsExisting: required.novelsExisting!,
    chaptersAdded: required.chaptersAdded!,
    chaptersSkipped: required.chaptersSkipped!,
    sourceRemaps: required.sourceRemaps!,
    tasksRestored: required.tasksRestored!,
    schedulerPoliciesRestored: required.schedulerPoliciesRestored!,
    searchDocumentsRebuilt: required.searchDocumentsRebuilt!,
    settingsOutcome
  };
  if (source.replaceAll === true) impact.replaceAll = true;
  for (const key of [
    'novelsTotal',
    'chaptersTotal',
    'tasksTotal',
    'schedulerPoliciesTotal',
    'searchDocumentsTotal'
  ] as const) {
    const count = safeCount(source[key]);
    if (count !== undefined) impact[key] = count;
  }
  return impact;
}

function resultDetails(operation: BackupOperationView): BackupOperationSummary['result'] {
  const source = operation.result ?? {};
  const result: NonNullable<BackupOperationSummary['result']> = {};
  if (typeof source.filename === 'string') result.filename = source.filename;
  if (typeof source.sizeBytes === 'number' && Number.isFinite(source.sizeBytes)) {
    result.sizeBytes = source.sizeBytes;
  }
  if (typeof source.encrypted === 'boolean') result.encrypted = source.encrypted;
  if (typeof source.expiresAt === 'string') result.expiresAt = source.expiresAt;
  const restoreMode = source.restoreMode ?? source.mode;
  if (restoreMode === 'merge' || restoreMode === 'replace') {
    result.restoreMode = restoreMode;
  }
  if (source.settingsPolicy === 'keep-current' || source.settingsPolicy === 'use-backup') {
    result.settingsPolicy = source.settingsPolicy;
  }
  const impact = restoreImpact(source.impact);
  if (impact) result.impact = impact;
  if (typeof source.settingsPending === 'boolean') result.settingsPending = source.settingsPending;
  if (operation.resultArtifactId) result.artifactId = operation.resultArtifactId;
  if (operation.safetyArtifactId) result.safetyArtifactId = operation.safetyArtifactId;
  return Object.keys(result).length > 0 ? result : null;
}

export function toBackupOperationSummary(operation: BackupOperationView): BackupOperationSummary {
  return {
    id: operation.id,
    kind: operation.kind,
    mode: operation.mode,
    state: operation.state,
    stage: operation.stage,
    cancellable: operation.cancellable,
    progress: {
      current: operation.progressCurrent,
      total: operation.progressTotal
    },
    startedAt: operation.startedAt,
    updatedAt: operation.updatedAt,
    finishedAt: operation.finishedAt,
    error: errorDetails(operation),
    result: resultDetails(operation)
  };
}
