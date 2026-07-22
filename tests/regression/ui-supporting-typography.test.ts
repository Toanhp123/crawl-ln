import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('supporting typography is a dedicated compact role', () => {
  const css = read('apps/web-legacy/src/shared/theme/typography.css');
  const text = read('apps/web-legacy/src/shared/ui/data-display/Text.tsx');
  assert.match(css, /--type-supporting-size:\s*12px/);
  assert.match(css, /--type-supporting-line:\s*15px/);
  assert.match(css, /--type-metadata-size:\s*11px/);
  assert.match(css, /--type-metadata-line:\s*13px/);
  assert.match(text, /supporting:/);
  assert.doesNotMatch(text, /description:/);
});

test('high-density current cards use supporting and metadata roles', () => {
  const settings = read('apps/web-legacy/src/pages/settings/ui/SettingsHubCard.tsx');
  const addOverlay = read('apps/web-legacy/src/app/layouts/GlobalAddNovelOverlay.tsx');
  const library = read('apps/web-legacy/src/entities/novel/ui/NovelLibraryCard.tsx');
  const task = read('apps/web-legacy/src/widgets/crawl-task-card/ui/CrawlTaskCard.tsx');
  assert.match(settings, /<CardDescription/);
  assert.match(settings, /<CardTitle/);
  assert.doesNotMatch(settings, /min-h-32/);
  assert.match(addOverlay, /variant="supporting"/);
  assert.match(library, /variant="caption"/);
  assert.match(task, /variant="metadata"/);
});
