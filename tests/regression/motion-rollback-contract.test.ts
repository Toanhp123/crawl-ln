import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function sourceFiles(root: string): string[] {
  return readdirSync(join(ROOT, root)).flatMap((name) => {
    const relative = join(root, name);
    const absolute = join(ROOT, relative);
    return statSync(absolute).isDirectory()
      ? sourceFiles(relative)
      : /\.(ts|tsx|css)$/.test(name)
        ? [relative]
        : [];
  });
}

test('web source has no JavaScript animation engine or retained route presence', () => {
  const packageJson = JSON.parse(read('apps/web/package.json')) as {
    dependencies?: Record<string, string>;
  };
  assert.equal(packageJson.dependencies?.motion, undefined);
  assert.equal(packageJson.dependencies?.['framer-motion'], undefined);

  for (const file of sourceFiles('apps/web/src')) {
    const source = read(file);
    assert.doesNotMatch(source, /motion\/react|framer-motion/);
    assert.doesNotMatch(source, /\bAnimatePresence\b|\blayoutId\s*=|\bMotionValue\b/);
    assert.doesNotMatch(source, /\buseMotionValue\b|\buseSpring\b|\buseAnimation\b/);
    assert.doesNotMatch(source, /Element\.prototype\.animate|\.animate\s*\(/);
  }
});

test('app renders the current outlet directly without a route motion coordinator', () => {
  const main = read('apps/web/src/main.tsx');
  const shell = read('apps/web/src/app/layouts/AppShell.tsx');
  assert.doesNotMatch(main, /AppMotionProvider/);
  assert.doesNotMatch(shell, /RouteMotionCoordinator/);
  assert.match(shell, /<Outlet\s*\/>/);
});

test('BottomSheet gesture is distance-threshold-only and never moves the panel inline', () => {
  const source = read('apps/web/src/shared/ui/overlay/BottomSheet.tsx');
  assert.doesNotMatch(source, /style=\{\{|transform:|velocity|spring|rubberBand/);
  assert.match(source, /DISMISS_DISTANCE_PX/);
  assert.match(source, /onOpenChange\(false\)/);
});
