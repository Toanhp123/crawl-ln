import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const profiles = JSON.parse(
  fs.readFileSync(new URL('../../apps/api/config/source-profiles.json', import.meta.url), 'utf8')
) as Array<{ id: string; selectors: { chapterContent: string[] } }>;

test('NovelCool profile has a marker-parent fallback for raw HTML', () => {
  const profile = profiles.find((candidate) => candidate.id === 'novelcool');
  assert.ok(profile);
  assert.ok(profile.selectors.chapterContent.includes('.overflow-hidden:has(.chapter-start-mark)'));
});
