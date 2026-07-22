import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');
test('appearance settings expose a persisted app-wide font size', () => {
  const provider = read('apps/web-legacy/src/shared/theme/runtime/ThemeProvider.tsx');
  const appearance = read('apps/web-legacy/src/pages/settings/ui/SettingsPage.tsx');
  const typography = read('apps/web-legacy/src/shared/theme/typography.css');
  assert.match(provider, /novel-tool-app-font/);
  assert.match(provider, /dataset\.appFont/);
  assert.match(appearance, /settings\.appFontSize/);
  assert.match(typography, /data-app-font='small'/);
  assert.match(typography, /data-app-font='large'/);
});
