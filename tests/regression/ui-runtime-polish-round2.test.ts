import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('toast lifecycle is owned by Radix without application timers', () => {
  const source = read('apps/web/src/shared/ui/feedback/Toast.tsx');

  assert.match(source, /<ToastPrimitive\.Provider/);
  assert.match(source, /onOpenChange=\{\(open\) => !open && dismiss\(item\.id\)\}/);
  assert.doesNotMatch(source, /DEFAULT_TOAST_DURATION|timersRef|window\.setTimeout|durationMs/);
});

test('settings sheets use explicit non-empty title keys', () => {
  const source = read('apps/web/src/pages/settings/ui/SettingsPage.tsx');

  assert.match(source, /PANEL_TITLE_KEYS/);
  assert.match(source, /scheduler:\s*'scheduler\.title'/);
  assert.match(source, /storage:\s*'settings\.dataSafety'/);
  assert.doesNotMatch(source, /model\.t\(`settings\.\$\{/);
});

test('activity sorts newest tasks and groups them by lifecycle state', () => {
  const source = read('apps/web/src/pages/activity/model/useActivityPage.ts');
  assert.match(source, /sort\(\(a, b\) => b\.updatedAt\.localeCompare\(a\.updatedAt\)\)/);
  assert.match(source, /\['running', 'pausing', 'paused', 'resuming'\]/);
  assert.match(source, /task\.status === 'queued'/);
  assert.match(source, /\['completed', 'failed', 'cancelled'\]/);
});

test('terminal task cards expose explicit localized outcomes', () => {
  const source = read('apps/web/src/widgets/crawl-task-card/ui/CrawlTaskCard.tsx');
  const status = read('apps/web/src/entities/task/model/status.ts');
  assert.match(status, /cancelled:\s*'cancelled'/);
  assert.match(source, /task\.status === 'completed'/);
  assert.match(source, /task\.status === 'failed'/);
  assert.match(source, /status\(task\.status\)/);
  assert.doesNotMatch(source, /LoaderCircle/);
});

test('activity retains cancelled work in recent history', () => {
  const model = read('apps/web/src/pages/activity/model/useActivityPage.ts');
  const en = read('apps/web/src/shared/i18n/locales/en.ts');
  const vi = read('apps/web/src/shared/i18n/locales/vi.ts');
  assert.match(model, /\['completed', 'failed', 'cancelled'\]/);
  assert.match(en, /'common\.status\.cancelled': 'Cancelled'/);
  assert.match(vi, /'common\.status\.cancelled': 'Đã hủy'/);
});
