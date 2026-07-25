import { createHash } from 'node:crypto';
import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import { fingerprintSqliteTables } from '../../../../platform/backup/sqlite-table-snapshot.js';
import type {
  BackupInventory,
  BackupMergeImpact,
  BackupRestorePlan,
  RestoreMode,
  RestoreSettingsPolicy
} from '../../domain/restore-session.models.js';
import type { BackupContributorCoordinator } from './backup-contributor-coordinator.js';

export interface BackupPlanInput {
  mode: RestoreMode;
  settingsPolicy: RestoreSettingsPolicy;
  archiveChecksum: string;
  stagedContributors: Record<string, unknown>;
  inventory: BackupInventory;
}

export interface BackupPlanResult {
  plan: BackupRestorePlan;
  fingerprint: `sha256-plan-v1:${string}`;
}

function count(
  impact: Record<string, Record<string, number>>,
  module: string,
  key: string
): number {
  return impact[module]?.[key] ?? 0;
}

function mergeImpact(
  contributorImpact: Record<string, Record<string, number>>,
  settingsPolicy: RestoreSettingsPolicy
): BackupMergeImpact {
  return {
    novelsNew: count(contributorImpact, 'library', 'novelsAdded'),
    novelsExisting: count(contributorImpact, 'library', 'novelsSkipped'),
    chaptersAdded: count(contributorImpact, 'library', 'chaptersAdded'),
    chaptersSkipped: count(contributorImpact, 'library', 'chaptersSkipped'),
    sourceRemaps:
      count(contributorImpact, 'library', 'novelRemaps') +
      count(contributorImpact, 'library', 'chapterRemaps'),
    tasksRestored: count(contributorImpact, 'ingestion', 'tasksAdded'),
    schedulerPoliciesRestored: count(contributorImpact, 'scheduler', 'policiesAdded'),
    searchDocumentsRebuilt: count(contributorImpact, 'search', 'indexedDocuments'),
    settingsOutcome: settingsPolicy
  };
}

function replaceImpact(
  inventory: BackupInventory,
  settingsPolicy: RestoreSettingsPolicy
): BackupMergeImpact {
  return {
    novelsNew: 0,
    novelsExisting: 0,
    chaptersAdded: 0,
    chaptersSkipped: 0,
    sourceRemaps: 0,
    tasksRestored: 0,
    schedulerPoliciesRestored: 0,
    searchDocumentsRebuilt: 0,
    settingsOutcome: settingsPolicy,
    replaceAll: true,
    novelsTotal: inventory.library.novels,
    chaptersTotal: inventory.library.chapters,
    tasksTotal: inventory.ingestion.tasks,
    schedulerPoliciesTotal: inventory.scheduler.policies,
    searchDocumentsTotal: inventory.search.indexedDocuments
  };
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical JSON cannot encode non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new Error(`Canonical JSON cannot encode ${typeof value}`);
}

export function fingerprintRestorePlan(input: {
  archiveChecksum: string;
  mode: RestoreMode;
  settingsPolicy: RestoreSettingsPolicy;
  targetFingerprint: string | null;
  contributorImpact: Record<string, Record<string, number>>;
  impact: BackupMergeImpact;
}): `sha256-plan-v1:${string}` {
  const payload = canonicalJson({
    version: 1,
    archiveChecksum: input.archiveChecksum,
    mode: input.mode,
    settingsPolicy: input.settingsPolicy,
    targetFingerprint: input.targetFingerprint,
    contributorImpact: input.contributorImpact,
    impact: input.impact
  });
  return `sha256-plan-v1:${createHash('sha256').update(payload, 'utf8').digest('hex')}`;
}

export class BackupMergePlanner {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly contributors: BackupContributorCoordinator,
    private readonly clock: { now(): Date }
  ) {}

  createPlan(input: BackupPlanInput): Promise<BackupPlanResult> {
    return input.mode === 'merge' ? this.createMergePlan(input) : this.createReplacePlan(input);
  }

  async createMergePlan(input: BackupPlanInput): Promise<BackupPlanResult> {
    return this.database.transactionAsync(() =>
      this.createMergePlanInCurrentTransaction(input, `backup-plan:${input.archiveChecksum}`)
    );
  }

  async createMergePlanInCurrentTransaction(
    input: BackupPlanInput,
    importId = `backup-verify:${input.archiveChecksum}`
  ): Promise<BackupPlanResult> {
    const targetFingerprint = fingerprintSqliteTables(
      this.database.connection,
      this.contributors.fingerprintTables()
    );
    const contributorImpact = await this.database.rollbackOnlySavepoint(
      'backup_merge_preview',
      () => this.contributors.importAll(input.stagedContributors, { importId })
    );
    return this.buildPlan(input, targetFingerprint, contributorImpact);
  }

  createReplacePlan(input: BackupPlanInput): Promise<BackupPlanResult> {
    return Promise.resolve(this.buildPlan(input, null, {}));
  }

  private buildPlan(
    input: BackupPlanInput,
    targetFingerprint: string | null,
    contributorImpact: Record<string, Record<string, number>>
  ): BackupPlanResult {
    const impact =
      input.mode === 'merge'
        ? mergeImpact(contributorImpact, input.settingsPolicy)
        : replaceImpact(input.inventory, input.settingsPolicy);
    const plan: BackupRestorePlan = {
      mode: input.mode,
      settingsPolicy: input.settingsPolicy,
      archiveChecksum: input.archiveChecksum,
      targetFingerprint,
      contributorImpact,
      impact,
      createdAt: this.clock.now().toISOString()
    };
    return {
      plan,
      fingerprint: fingerprintRestorePlan({
        archiveChecksum: plan.archiveChecksum,
        mode: plan.mode,
        settingsPolicy: plan.settingsPolicy,
        targetFingerprint: plan.targetFingerprint,
        contributorImpact: plan.contributorImpact,
        impact: plan.impact
      })
    };
  }
}
