import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = `${root}/${name}`;
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx)$/.test(name)
        ? [path]
        : [];
  });
}

test('shared Button renders idle, loading, success and error from one action-state contract', () => {
  const source = read('apps/web-legacy/src/shared/ui/actions/Button.tsx');
  const feedback = read('apps/web-legacy/src/shared/ui/actions/actionFeedback.ts');

  assert.match(source, /actionState\?: ActionState/);
  assert.match(source, /feedbackPolicy\?: ActionFeedbackPolicyName/);
  assert.match(source, /leadingIcon\?: ReactNode/);
  assert.match(source, /CircleX/);
  assert.match(source, /data-feedback-phase/);
  assert.match(source, /aria-busy=/);
  assert.match(source, /button-feedback-enter/);
  assert.doesNotMatch(source, /loading\?: boolean/);
  assert.doesNotMatch(source, /Children\.toArray|isValidElement/);

  assert.match(feedback, /standard:/);
  assert.match(feedback, /immediate:/);
  assert.match(feedback, /longRunning:/);
  assert.match(feedback, /errorDurationMs/);
});

test('feedback timing is not configurable with raw milliseconds outside the central policy', () => {
  const files = sourceFiles('apps/web-legacy/src').filter(
    (path) => !path.endsWith('/shared/ui/actions/actionFeedback.ts')
  );

  for (const path of files) {
    const source = read(path);
    assert.doesNotMatch(
      source,
      /loadingDelayMs|loadingMinDurationMs|successDurationMs|errorDurationMs/,
      path
    );
    assert.doesNotMatch(source, /<Button[\s\S]{0,240}\bloading=/, path);
  }
});

test('async product actions pass mutation outcome instead of a pending boolean', () => {
  const expectations: Array<[string, RegExp]> = [
    [
      'apps/web-legacy/src/app/layouts/GlobalAddNovelOverlay.tsx',
      /actionState=\{addNovel\.status\}/
    ],
    [
      'apps/web-legacy/src/features/test-source-plugin/ui/TestSourcePluginButton.tsx',
      /actionState=\{mutation\.status\}/
    ],
    [
      'apps/web-legacy/src/features/search-library/ui/SearchIndexPanel.tsx',
      /actionState=\{m\.status\}/
    ],
    [
      'apps/web-legacy/src/pages/task-detail/ui/TaskDetailPage.tsx',
      /actionState=\{pause\.status\}/
    ],
    [
      'apps/web-legacy/src/pages/settings/ui/SettingsPage.tsx',
      /actionState=\{model\.runScheduler\.status\}/
    ],
    [
      'apps/web-legacy/src/pages/novel-detail/ui/NovelDetailPage.tsx',
      /actionState=\{model\.removeNovel\.status\}/
    ]
  ];

  for (const [path, pattern] of expectations) assert.match(read(path), pattern, path);
});

test('long operations keep their labels stable and use the shared long-running policy', () => {
  const backup = read('apps/web-legacy/src/features/backup-library/ui/BackupRestorePanel.tsx');
  const exportMenu = read('apps/web-legacy/src/features/export-novel/ui/ExportMenu.tsx');

  assert.match(backup, /actionState=\{backupAction\.state\}/);
  assert.match(backup, /actionState=\{restoreAction\.state\}/);
  assert.match(backup, /useAsyncAction/);
  assert.match(backup, /feedbackPolicy="longRunning"/);
  assert.doesNotMatch(backup, /busy === 'backup' \? t\('common\.processing'\)/);

  assert.match(exportMenu, /actionState=\{exportAction\.state\}/);
  assert.match(exportMenu, /useAsyncAction/);
  assert.match(exportMenu, /feedbackPolicy="longRunning"/);
  assert.doesNotMatch(exportMenu, /busy \? t\('export\.preparing'\)/);
});
