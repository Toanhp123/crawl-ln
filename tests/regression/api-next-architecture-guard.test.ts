import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkApiNextArchitecture } from '../../scripts/lib/api-next-architecture.mjs';

const validModuleSurfaces = {
  'modules/library/public/library.api.ts': 'export interface LibraryApi {}',
  'modules/library/index.ts': "export type { LibraryApi } from './public/library.api.js';",
  'modules/ingestion/public/ingestion.api.ts': 'export interface IngestionApi {}',
  'modules/ingestion/index.ts': "export type { IngestionApi } from './public/ingestion.api.js';"
};

async function fixture(
  files: Record<string, string>,
  options: { moduleSurfaces?: boolean } = {}
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'api-next-architecture-'));
  const source = options.moduleSurfaces === false ? files : { ...validModuleSurfaces, ...files };
  for (const [relative, content] of Object.entries(source)) {
    const target = join(root, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

test('guard rejects cross-module internal imports', async (context) => {
  const root = await fixture({
    'modules/library/application/read.ts':
      "import '../../ingestion/infrastructure/sqlite/repository.js';",
    'modules/ingestion/infrastructure/sqlite/repository.ts': 'export const repository = {};'
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  assert.match((await checkApiNextArchitecture(root)).join('\n'), /cross-module internal import/);
});

test('guard resolves dynamic alias imports before enforcing module boundaries', async (context) => {
  const root = await fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@/*': ['*'] } }
    }),
    'modules/library/application/read.ts':
      "export const load = () => import('@/modules/ingestion/infrastructure/sqlite/repository.js');",
    'modules/ingestion/infrastructure/sqlite/repository.ts': 'export const repository = {};'
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  assert.match((await checkApiNextArchitecture(root)).join('\n'), /cross-module internal import/);
});

test('guard permits cross-module imports through the target public surface', async (context) => {
  const root = await fixture({
    'modules/library/application/read.ts':
      "import type { IngestionApi } from '../../ingestion/public/ingestion.api.js'; export type Dependency = IngestionApi;"
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  assert.deepEqual(await checkApiNextArchitecture(root), []);
});

test('guard rejects foreign module table prefixes', async (context) => {
  const root = await fixture({
    'modules/library/infrastructure/sqlite/repository.ts':
      "const sql = 'UPDATE ingestion_jobs SET status=?';"
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  assert.match((await checkApiNextArchitecture(root)).join('\n'), /foreign table prefix/);
});

test('guard rejects cross-module foreign keys', async (context) => {
  const root = await fixture({
    'modules/library/infrastructure/migrations/001-library.ts':
      "const sql = 'CREATE TABLE library_items(id TEXT, job_id TEXT REFERENCES ingestion_jobs(id));';"
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  assert.match((await checkApiNextArchitecture(root)).join('\n'), /foreign table prefix/);
});

test('guard rejects deep composition behavior', async (context) => {
  const root = await fixture({
    'bootstrap/container.ts': 'const jobs = await repository.list();'
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  assert.match((await checkApiNextArchitecture(root)).join('\n'), /composition behavior/);
});

test('guard enforces clean layer direction inside a module', async (context) => {
  const root = await fixture({
    'modules/library/application/read.ts': "import '../infrastructure/sqlite/repository.js';",
    'modules/library/infrastructure/sqlite/repository.ts': 'export const repository = {};'
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  assert.match((await checkApiNextArchitecture(root)).join('\n'), /layer direction/);
});

test('guard limits shared transport contracts to presentation and approved adapters', async (context) => {
  const invalidRoot = await fixture({
    'modules/library/domain/library.models.ts':
      "import type { ApiResponse } from '@novel-tool/shared'; export type Result = ApiResponse<string>;"
  });
  const validRoot = await fixture({
    'platform/http/api-response.ts':
      "import type { ApiResponse } from '@novel-tool/shared'; export type Result = ApiResponse<string>;"
  });
  context.after(() => rm(invalidRoot, { recursive: true, force: true }));
  context.after(() => rm(validRoot, { recursive: true, force: true }));

  assert.match((await checkApiNextArchitecture(invalidRoot)).join('\n'), /shared transport/);
  assert.deepEqual(await checkApiNextArchitecture(validRoot), []);
});

test('guard requires public API and index surfaces for every module', async (context) => {
  const root = await fixture(
    { 'modules/library/domain/library.models.ts': 'export interface LibraryNovel {}' },
    { moduleSurfaces: false }
  );
  context.after(() => rm(root, { recursive: true, force: true }));

  const violations = (await checkApiNextArchitecture(root)).join('\n');
  assert.match(violations, /public\/library\.api\.ts/);
  assert.match(violations, /modules\/library\/index\.ts/);
});
