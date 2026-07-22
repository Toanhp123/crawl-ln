import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

const countDefinition = (source: string, token: string) =>
  (source.match(new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'g')) ?? [])
    .length;

test('component tokens have one owner and utility CSS does not redefine them', async () => {
  const components = await read('apps/web-legacy/src/shared/theme/components.css');
  const componentTokens = await read('apps/web-legacy/src/shared/theme/component-tokens.css');
  const owned = [
    '--button-radius',
    '--button-font-weight',
    '--card-radius',
    '--card-padding',
    '--input-radius'
  ];

  for (const token of owned) {
    assert.equal(countDefinition(componentTokens, token), 1, `${token} should be defined once`);
    assert.equal(
      countDefinition(components, token),
      0,
      `${token} must not be redefined by utilities`
    );
  }
});

test('motion and elevation expose one canonical scale', async () => {
  const motion = await read('apps/web-legacy/src/shared/theme/motion.css');
  const elevation = await read('apps/web-legacy/src/shared/theme/elevation.css');
  const index = await read('apps/web-legacy/src/shared/theme/index.css');
  const themeFiles = await readdir(new URL('apps/web-legacy/src/shared/theme/', root));

  assert.match(motion, /--motion-instant:/);
  assert.match(motion, /--motion-fast:/);
  assert.match(motion, /--motion-normal:/);
  assert.match(motion, /--motion-slow:/);
  assert.doesNotMatch(motion, /--duration-/);

  for (const level of [0, 1, 2, 3]) assert.match(elevation, new RegExp(`--elevation-${level}:`));
  assert.doesNotMatch(elevation, /--elevation-(?:none|low|medium|high):/);
  assert.equal(themeFiles.includes('shadows.css'), false);
  assert.doesNotMatch(index, /shadows\.css/);
});

test('web source does not use legacy or undefined shadow and motion aliases', async () => {
  const files = await readdir(new URL('apps/web-legacy/src/', root), { recursive: true });
  const sources = await Promise.all(
    files
      .filter((path) => /\.(?:css|ts|tsx)$/.test(path))
      .map((path) => read(`apps/web-legacy/src/${path}`))
  );
  const source = sources.join('\n');

  assert.doesNotMatch(source, /var\(--duration-/);
  assert.doesNotMatch(source, /var\(--elevation-(?:none|low|medium|high)\)/);
  assert.doesNotMatch(source, /var\(--shadow-(?:sm|xs|soft|card|sheet|focus)\)/);
  assert.doesNotMatch(source, /\bshadow-(?:card|sheet|soft)\b/);
});
