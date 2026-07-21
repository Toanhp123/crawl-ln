import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('web-next is an isolated workspace with isolated ports', async () => {
  const workspace = JSON.parse(await readFile('apps/web-next/package.json', 'utf8')) as {
    name?: string;
  };
  const vite = await readFile('apps/web-next/vite.config.ts', 'utf8');
  const api = await readFile('apps/web-next/src/shared/config/api.ts', 'utf8');

  assert.equal(workspace.name, '@novel-tool/web-next');
  assert.match(vite, /port:\s*5174/);
  assert.match(vite, /http:\/\/localhost:3100/);
  assert.match(vite, /preview:\s*\{\s*port:\s*4174/s);
  assert.match(vite, /__APP_VERSION__/);
  assert.match(api, /http:\/\/127\.0\.0\.1:3100/);
});

test('root scripts expose the web-next lifecycle without changing current web defaults', async () => {
  const rootPackage = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const currentVite = await readFile('apps/web/vite.config.ts', 'utf8');

  assert.equal(
    rootPackage.scripts?.['dev:web-next'],
    'npm run prepare:packages && npm run dev -w @novel-tool/web-next'
  );
  assert.equal(
    rootPackage.scripts?.['check:web-next'],
    'npm run prepare:packages && npm run check -w @novel-tool/web-next'
  );
  assert.equal(
    rootPackage.scripts?.['build:web-next'],
    'npm run prepare:packages && npm run build -w @novel-tool/web-next'
  );
  assert.match(currentVite, /port:\s*5173/);
  assert.match(currentVite, /http:\/\/localhost:3000/);
});
