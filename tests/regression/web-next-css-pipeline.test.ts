import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('web-next owns a complete Tailwind and PostCSS entrypoint', async () => {
  const [packageJson, postcss, tailwind, css, main] = await Promise.all([
    readFile('apps/web-next/package.json', 'utf8'),
    readFile('apps/web-next/postcss.config.js', 'utf8'),
    readFile('apps/web-next/tailwind.config.ts', 'utf8'),
    readFile('apps/web-next/src/app/styles/index.css', 'utf8'),
    readFile('apps/web-next/src/main.tsx', 'utf8')
  ]);

  for (const dependency of ['tailwindcss', 'postcss', 'autoprefixer']) {
    assert.match(packageJson, new RegExp(`"${dependency}"`));
  }
  assert.match(postcss, /tailwindcss/);
  assert.match(postcss, /autoprefixer/);
  assert.match(tailwind, /\.\/src\/\*\*\/\*\.\{ts,tsx\}/);
  assert.match(css, /@import ['"]\.\.\/\.\.\/shared\/theme\/index\.css['"]/);
  assert.match(css, /@tailwind base/);
  assert.match(css, /@tailwind components/);
  assert.match(css, /@tailwind utilities/);
  assert.match(main, /@\/app\/styles\/index\.css/);
  assert.doesNotMatch(main, /@\/shared\/theme\/index\.css/);
});
