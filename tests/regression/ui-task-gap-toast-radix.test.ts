import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('toast dismissal is owned by Radix without application fallback timers', () => {
  const source = read('apps/web-legacy/src/shared/ui/feedback/Toast.tsx');

  assert.match(source, /<ToastPrimitive\.Provider/);
  assert.match(source, /onOpenChange=\{\(open\) => !open && dismiss\(item\.id\)\}/);
  assert.doesNotMatch(source, /DEFAULT_TOAST_DURATION/);
  assert.doesNotMatch(source, /timersRef/);
  assert.doesNotMatch(source, /window\.setTimeout/);
  assert.doesNotMatch(source, /window\.clearTimeout/);
  assert.doesNotMatch(source, /durationMs/);
  assert.doesNotMatch(source, /duration=\{/);
});

test('task detail uses the sticky-action page inset without extra content breathing room', () => {
  const page = read('apps/web-legacy/src/shared/ui/layout/Page.tsx');
  const detail = read('apps/web-legacy/src/pages/task-detail/ui/TaskDetailPage.tsx');

  assert.match(page, /bottomInset\s*=\s*'content'/);
  assert.match(page, /stickyAction:\s*'pb-\[var\(--app-nav-total\)\] md:pb-0'/);
  assert.match(detail, /<Page bottomInset="stickyAction" className="space-y-3">/);
  assert.doesNotMatch(detail, /pb-\[calc\(var\(--app-nav-total\)\+var\(--space-6\)\)\]/);
});
