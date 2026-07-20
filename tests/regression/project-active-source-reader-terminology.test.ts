import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const activeFiles = [
  'apps/api/.env.example',
  'apps/api/.env.termux.example',
  'apps/web/src/shared/i18n/locales/en.ts',
  'apps/web/src/shared/i18n/locales/vi.ts'
];

const retiredPatterns = [
  /\bsource[-_ ]profiles?\b/i,
  /\bSOURCE_PROFILES_FILE\b/,
  /\bsource-profiles\.json\b/i,
  /\bGENERIC_HTML_ADAPTER_ENABLED\b/
];

test('active setup and UI copy use Source Reader plugin terminology only', async () => {
  for (const path of activeFiles) {
    const content = await readFile(path, 'utf8');
    for (const pattern of retiredPatterns) {
      assert.doesNotMatch(content, pattern, `${path} contains retired source runtime wording`);
    }
  }
});
