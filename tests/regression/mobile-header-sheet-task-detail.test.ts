import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('task detail uses the dedicated sticky-action bottom inset', () => {
  const source = read('apps/web-legacy/src/pages/task-detail/ui/TaskDetailPage.tsx');

  assert.match(source, /<Page bottomInset="stickyAction" className="space-y-3">/);
  assert.doesNotMatch(source, /<Page className="[^"]*pb-2/);
});

test('bottom sheet aligns its header and supports drag-to-dismiss', () => {
  const source = read('apps/web-legacy/src/shared/ui/overlay/BottomSheet.tsx');

  assert.match(source, /items-center justify-between/);
  assert.match(source, /onPointerDown=\{handleDragStart\}/);
  assert.match(source, /onPointerMove=\{handleDragMove\}/);
  assert.match(source, /onPointerUp=\{handleDragEnd\}/);
  assert.match(source, /onPointerCancel=\{handleDragCancel\}/);
  assert.match(source, /DISMISS_DISTANCE_PX/);
  assert.doesNotMatch(source, /translate3d|velocity|spring/);
  assert.match(source, /onOpenChange\(false\)/);
});

test('the application header is visible on mobile while desktop navigation stays responsive', () => {
  const source = read('apps/web-legacy/src/widgets/app-header/ui/AppHeader.tsx');
  const shell = read('apps/web-legacy/src/app/layouts/AppShell.tsx');

  assert.match(shell, /className="md:hidden"/);
  assert.match(source, /shrink-0 border-b border-border/);
  assert.match(source, /to="\/library"/);
  assert.doesNotMatch(source, /<nav|\/crawl|\/tasks/);
  assert.match(source, /Novel Tool/);
});
