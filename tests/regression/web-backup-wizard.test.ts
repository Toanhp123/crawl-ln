import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = 'apps/web/src/features/backup-library';

async function source(path: string) {
  return readFile(path, 'utf8');
}

test('Restore wizard exposes eight semantic steps in one sheet-owned root', async () => {
  const state = await source(`${root}/model/restore-wizard-state.ts`);
  const wizard = await source(`${root}/ui/RestoreWizard.tsx`);
  const header = await source(`${root}/ui/RestoreWizardHeader.tsx`);

  for (const step of [
    'choose-file',
    'upload-validate',
    'inventory',
    'options',
    'impact',
    'confirmation',
    'progress',
    'result'
  ]) {
    assert.match(state, new RegExp(`['\"]${step}['\"]`));
  }
  assert.doesNotMatch(wizard, /BottomSheet|Modal|Dialog|Drawer/);
  assert.match(wizard, /data-restore-wizard/);
  assert.match(header, /current/);
  assert.match(header, /total:\s*8/);
  assert.match(header, /Progress/);
  assert.doesNotMatch(header, /grid-cols-8|repeat\(8/);
});

test('Choose, upload, inventory, options, and impact steps preserve safety contracts', async () => {
  const choose = await source(`${root}/ui/RestoreChooseFileStep.tsx`);
  const hook = await source(`${root}/model/use-restore-wizard.ts`);
  const upload = await source(`${root}/ui/RestoreUploadStep.tsx`);
  const inventory = await source(`${root}/ui/RestoreInventoryStep.tsx`);
  const options = await source(`${root}/ui/RestoreOptionsStep.tsx`);
  const impact = await source(`${root}/ui/RestoreImpactStep.tsx`);

  assert.match(hook, /MAX_RESTORE_FILE_BYTES\s*=\s*512\s*\*\s*1024\s*\*\s*1024/);
  assert.match(choose, /replaceExisting/);
  assert.match(choose, /\.nvt,application\/vnd\.novel-tool\.backup/);

  assert.match(upload, /receivedBytes/);
  assert.match(upload, /expectedBytes/);
  assert.match(upload, /reselect/i);
  assert.match(upload, /attemptsRemaining/);
  assert.doesNotMatch(upload, /localStorage/);

  assert.match(inventory, /<dl/);
  assert.doesNotMatch(inventory, /sourceUrl|chapterText|credentialValue|rawSettings/);

  assert.match(options, /['\"]merge['\"]/);
  assert.match(options, /['\"]replace['\"]/);
  assert.match(options, /['\"]keep-current['\"]/);
  assert.match(options, /['\"]use-backup['\"]/);

  assert.match(impact, /mergePlan|impact/);
  assert.match(impact, /chaptersAdded/);
  assert.match(impact, /chaptersSkipped/);
  assert.match(impact, /expiresAt/);
});

test('Confirmation, progress, and result steps enforce execution boundaries', async () => {
  const confirmation = await source(`${root}/ui/RestoreConfirmationStep.tsx`);
  const progress = await source(`${root}/ui/RestoreProgressStep.tsx`);
  const result = await source(`${root}/ui/RestoreResultStep.tsx`);
  const catalog = await source(`${root}/i18n/catalog.ts`);

  const validation = await source(`${root}/model/restore-validation.ts`);
  assert.match(validation, /THAY THẾ DỮ LIỆU/);
  assert.match(confirmation, /typedPhrase\s*===\s*REPLACE_CONFIRMATION_PHRASE/);
  assert.match(progress, /cancellable/);
  assert.match(progress, /backup\.restore\.notCancellable/);
  assert.match(catalog, /cannot be cancelled|Không thể hủy/i);
  assert.match(result, /safetyArtifactId/);
  assert.match(result, /RESTORE_PLAN_STALE/);
  assert.doesNotMatch(result, /stack|temporaryRoot|safetyBackupPath/);
});

test('Settings mounts the wizard and no visible synchronous Restore remains', async () => {
  const panel = await source(`${root}/ui/BackupLibraryPanel.tsx`);
  const libraryHook = await source(`${root}/model/use-backup-library.ts`).catch(() => '');
  const api = await source(`${root}/api/backup-library.ts`);

  assert.match(panel, /<RestoreWizard/);
  assert.doesNotMatch(panel, /LegacyRestoreCard|useRestoreLibraryBackup|ConfirmDialog/);
  assert.doesNotMatch(libraryHook, /useMaintenanceOperation|restoreLibraryBackup/);
  assert.doesNotMatch(api, /restoreLibraryBackup|RestoreBackupInput|x-restore-mode/);
});

test('Backup settings event is allowlisted and consumed by all owning providers', async () => {
  const settings = await source(`${root}/lib/settings.ts`);
  const theme = await source('apps/web/src/shared/theme/runtime/AppThemeProvider.tsx');
  const i18n = await source('apps/web/src/shared/i18n/I18nProvider.tsx');
  const reader = await source(
    'apps/web/src/features/reader-preferences/model/ReaderPreferencesProvider.tsx'
  );

  assert.match(settings, /BACKUP_SETTINGS_APPLIED_EVENT/);
  assert.match(settings, /dispatchEvent/);
  assert.doesNotMatch(settings, /for\s*\(const\s*\[key/);
  for (const provider of [theme, i18n, reader]) {
    assert.match(provider, /BACKUP_SETTINGS_APPLIED_EVENT/);
    assert.match(provider, /addEventListener/);
    assert.match(provider, /removeEventListener/);
  }
});

test('Legacy backend Restore surface is removed after wizard activation', async () => {
  const routes = await source('apps/api/src/modules/backup/presentation/backup.routes.ts');
  const controller = await source('apps/api/src/modules/backup/presentation/backup.controller.ts');
  const publicApi = await source('apps/api/src/modules/backup/public/backup.api.ts');
  const shared = await source('packages/shared/src/index.ts');

  assert.doesNotMatch(routes, /router\.post\(\s*['\"]\/restore['\"]/);
  assert.doesNotMatch(controller, /legacyRestoreFingerprint|restore\s*=\s*async/);
  assert.doesNotMatch(publicApi, /runLegacyRestore|restore\(input|restore:\s*\(/);
  assert.doesNotMatch(shared, /BackupRestoreResult|BackupRestoreMode|BackupSettingsMode/);
  await assert.rejects(
    () => access('apps/api/src/modules/backup/application/commands/restore-backup.command.ts'),
    /ENOENT/
  );
});

test('terminal Restore results match stored operation state and retry returns to the ready session', async () => {
  const wizard = await source(`${root}/ui/RestoreWizard.tsx`);
  const hook = await source(`${root}/model/use-restore-wizard.ts`);
  const state = await source(`${root}/model/restore-wizard-state.ts`);
  const result = await source(`${root}/ui/RestoreResultStep.tsx`);

  assert.match(wizard, /activeRestore|operation\.id\s*===\s*wizard\.state\.operationId/);
  assert.match(state, /operation-cleared/);
  assert.match(hook, /retryPreparation/);
  assert.match(result, /retryPreparation/);
});

test('fifth password failure clears the dead session and returns to file selection', async () => {
  const hook = await source(`${root}/model/use-restore-wizard.ts`);
  assert.match(hook, /caught\.status\s*===\s*410/);
  assert.match(hook, /clearStoredRestoreSession/);
  assert.match(hook, /dispatch\(\{\s*type:\s*['"]reset['"]/);
});

test('stale operation result clears the terminal operation and requests a fresh plan', async () => {
  const hook = await source(`${root}/model/use-restore-wizard.ts`);
  const result = await source(`${root}/ui/RestoreResultStep.tsx`);
  assert.match(hook, /const replan = useCallback/);
  assert.match(hook, /dispatch\(\{\s*type:\s*['"]operation-cleared['"]/);
  assert.match(hook, /createPlan\(state\.mode, state\.settingsPolicy/);
  assert.match(result, /wizard\.replan/);
});

test('Restore E2E reload assertions count main-frame document requests, not generic frame events', async () => {
  const e2e = await source('tests/e2e/settings-backup-restore.spec.ts');
  assert.match(e2e, /isNavigationRequest\(\)/);
  assert.match(e2e, /resourceType\(\)\s*!==\s*['"]document['"]/);
  assert.match(e2e, /request\.frame\(\)\s*!==\s*page\.mainFrame\(\)/);
  assert.doesNotMatch(e2e, /framenavigated/);
});

test('Restore E2E seed preserves application-written session state across reload', async () => {
  const e2e = await source('tests/e2e/settings-backup-restore.spec.ts');
  assert.match(e2e, /sessionStorage\.getItem\(RESTORE_STORAGE_KEY\)/);
  assert.match(e2e, /if \(sessionStorage\.getItem\(RESTORE_STORAGE_KEY\)\) return/);
});
