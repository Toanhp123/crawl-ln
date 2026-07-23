import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

test('web build pins Tailwind config and resolves content relative to that config', async () => {
  const postcss = await readFile(join(projectRoot, 'apps/web/postcss.config.js'), 'utf8');
  const tailwind = await readFile(join(projectRoot, 'apps/web/tailwind.config.ts'), 'utf8');

  assert.match(
    postcss,
    /fileURLToPath\(new URL\('\.\/tailwind\.config\.ts', import\.meta\.url\)\)/
  );
  assert.match(postcss, /tailwindcss:\s*\{\s*config:\s*tailwindConfig\s*\}/s);
  assert.match(
    tailwind,
    /content:\s*\{\s*relative:\s*true,\s*files:\s*\[\s*'\.\/index\.html',\s*'\.\/src\/\*\*\/\*\.\{ts,tsx\}'\s*\]\s*\}/s
  );
});
