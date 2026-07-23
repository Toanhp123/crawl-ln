import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkWebArchitecture } from '../../scripts/lib/web-architecture.mjs';

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'web-architecture-'));
  const source = {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        baseUrl: '.',
        paths: { '@/*': ['src/*'] }
      },
      include: ['src']
    }),
    ...files
  };

  for (const [relative, content] of Object.entries(source)) {
    const target = join(root, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

test('guard resolves alias, relative, export, and dynamic deep imports', async (context) => {
  const root = await fixture({
    'src/entities/novel/index.ts': 'export const novel = 1;',
    'src/entities/novel/model/private.ts': 'export const privateValue = 1;',
    'src/pages/library/index.ts': "export * from './ui/Page';",
    'src/pages/library/ui/Page.ts': [
      "import { privateValue } from '@/entities/novel/model/private';",
      "export { privateValue as leaked } from '../../../entities/novel/model/private';",
      "export const load = () => import('@/entities/novel/model/private');"
    ].join('\n')
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const errors = await checkWebArchitecture(root);
  assert.equal(errors.filter((item) => item.includes('public index')).length, 3);
});

test('guard parses import types and require calls before enforcing public indexes', async (context) => {
  const root = await fixture({
    'src/entities/novel/index.ts': 'export interface Novel {}',
    'src/entities/novel/model/private.ts': 'export interface PrivateNovel {}',
    'src/features/load/index.ts': "export * from './model/load';",
    'src/features/load/model/load.ts': [
      "export type Loaded = import('@/entities/novel/model/private').PrivateNovel;",
      "export const load = () => require('../../../entities/novel/model/private');"
    ].join('\n')
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const errors = await checkWebArchitecture(root);
  assert.equal(errors.filter((item) => item.includes('public index')).length, 2);
});

test('guard rejects missing slice indexes, domain shared state, and page mutations', async (context) => {
  const root = await fixture({
    'src/shared/api/novelQueryKeys.ts': "export const novelKeys = ['novels'];",
    'src/entities/task/model/private.ts': 'export const task = 1;',
    'src/features/save/index.ts': 'export {};',
    'src/pages/settings/index.ts': "export * from './ui/Page';",
    'src/pages/settings/ui/Page.tsx':
      "import { useMutation } from '@tanstack/react-query'; export const Page = () => useMutation({ mutationFn: async () => 1 }) as never;"
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const errors = await checkWebArchitecture(root);
  assert.ok(errors.some((item) => item.includes('shared cannot own domain concepts')));
  assert.ok(errors.some((item) => item.includes('slice is missing index.ts')));
  assert.ok(errors.some((item) => item.includes('pages cannot own product mutations')));
});

test('guard rejects upward and same-layer cross-slice dependencies', async (context) => {
  const root = await fixture({
    'src/entities/novel/index.ts': "export * from './model/novel';",
    'src/entities/novel/model/novel.ts': "import { save } from '@/features/save'; export { save };",
    'src/entities/task/index.ts': 'export const task = 1;',
    'src/features/save/index.ts': "export * from './model/save';",
    'src/features/save/model/save.ts':
      "import { other } from '@/features/other'; export { other };",
    'src/features/other/index.ts': 'export const other = 1;',
    'src/pages/library/index.ts': "export * from './ui/Page';",
    'src/pages/library/ui/Page.ts':
      "import { settings } from '@/pages/settings'; export { settings };",
    'src/pages/settings/index.ts': 'export const settings = 1;'
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const errors = await checkWebArchitecture(root);
  assert.ok(errors.some((item) => item.includes('cannot import upward')));
  assert.ok(errors.some((item) => item.includes('same-layer slices cannot cross-import')));
  assert.ok(errors.some((item) => item.includes('page slices cannot import each other')));
});

test('guard locks TanStack hook and mutating HTTP ownership', async (context) => {
  const root = await fixture({
    'src/entities/novel/index.ts': "export * from './api/useNovel';",
    'src/entities/novel/api/useNovel.ts':
      "import { useQuery } from '@tanstack/react-query'; export const useNovel = () => useQuery({ queryKey: ['ok'], queryFn: async () => 1 });",
    'src/features/save/index.ts': "export * from './api/useSave';",
    'src/features/save/api/useSave.ts':
      "import { useMutation } from '@tanstack/react-query'; export const useSave = () => useMutation({ mutationFn: async () => 1 });",
    'src/widgets/dashboard/index.ts': "export * from './ui/Dashboard';",
    'src/widgets/dashboard/ui/Dashboard.ts':
      "import { useQuery } from '@tanstack/react-query'; export const query = useQuery;",
    'src/pages/library/index.ts': "export * from './ui/Page';",
    'src/pages/library/ui/Page.ts':
      "export const save = () => fetch('/api/novels', { method: 'POST' });",
    'src/app/realtime/router.ts': "export const remove = () => client.delete('/api/novels/1');"
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const errors = await checkWebArchitecture(root);
  assert.ok(errors.some((item) => item.includes('query hooks belong to entities')));
  assert.equal(
    errors.filter((item) => item.includes('app/pages cannot issue mutating HTTP requests')).length,
    2
  );
  assert.ok(!errors.some((item) => item.includes('entities/novel/api/useNovel.ts')));
  assert.ok(!errors.some((item) => item.includes('features/save/api/useSave.ts')));
});

test('guard scans shared declarations and strings while allowing technical names', async (context) => {
  const invalidRoot = await fixture({
    'src/shared/api/index.ts': "export * from './taskClient';",
    'src/shared/api/taskClient.ts': [
      'export interface SourceReaderSession {}',
      "export const endpoint = '/api/tasks?status=running';"
    ].join('\n')
  });
  const validRoot = await fixture({
    'src/shared/lib/index.ts': "export * from './timerScheduler';",
    'src/shared/lib/timerScheduler.ts': [
      "export const storagePrefix = 'novel-tool:theme';",
      'export function createTimerScheduler(callback: () => void) { return setTimeout(callback, 1); }'
    ].join('\n')
  });
  context.after(() => rm(invalidRoot, { recursive: true, force: true }));
  context.after(() => rm(validRoot, { recursive: true, force: true }));

  assert.ok(
    (await checkWebArchitecture(invalidRoot)).filter((item) =>
      item.includes('shared cannot own domain concepts')
    ).length >= 2
  );
  assert.deepEqual(await checkWebArchitecture(validRoot), []);
});

test('guard rejects product API endpoints that end a shared string literal', async (context) => {
  const root = await fixture({
    'src/shared/api/index.ts': "export * from './endpoints';",
    'src/shared/api/endpoints.ts':
      "export const endpoints = ['/api/search', '/api/backups', '/api/export'];"
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const errors = await checkWebArchitecture(root);
  assert.equal(
    errors.filter((item) => item.includes('shared cannot own domain concepts')).length,
    3
  );
});

test('guard scans shared object keys and template literal segments', async (context) => {
  const root = await fixture({
    'src/shared/lib/index.ts': "export * from './state';",
    'src/shared/lib/state.ts': [
      "const id = '1';",
      'export const state = { chapter: 1, endpoint: `/api/tasks/${id}` };'
    ].join('\n')
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const errors = await checkWebArchitecture(root);
  assert.ok(errors.some((item) => item.includes('(chapter)')));
  assert.ok(errors.some((item) => item.includes('/api/tasks/')));
});

test('guard rejects domain selectors and custom properties in shared styles', async (context) => {
  const root = await fixture({
    'src/shared/theme/index.ts': 'export {};',
    'src/shared/theme/base.css': [
      '.novel-card { display: block; }',
      '[data-source-reader-state="ready"] { opacity: 1; }',
      ':root { --task-status-color: currentColor; }'
    ].join('\n')
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const errors = await checkWebArchitecture(root);
  assert.equal(errors.filter((item) => item.includes('shared cannot own domain CSS')).length, 3);
});

test('guard rejects reader-owned selectors and custom properties in shared styles', async (context) => {
  const root = await fixture({
    'src/shared/theme/index.ts': 'export {};',
    'src/shared/theme/base.css': [
      '.reader-content { display: block; }',
      '[data-reader-mode="paged"] { overflow: hidden; }',
      ':root { --reader-content-max: 70ch; }'
    ].join('\n')
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const errors = await checkWebArchitecture(root);
  assert.equal(errors.filter((item) => item.includes('shared cannot own reader CSS')).length, 3);
});

test('guard accepts public-index imports and same-slice internals', async (context) => {
  const root = await fixture({
    'src/entities/novel/index.ts': "export * from './model/novel';",
    'src/entities/novel/model/novel.ts':
      "import { normalize } from './normalize'; export const novel = normalize('novel');",
    'src/entities/novel/model/normalize.ts': 'export const normalize = (value: string) => value;',
    'src/features/save/index.ts': "export * from './model/save';",
    'src/features/save/model/save.ts':
      "import { novel } from '@/entities/novel'; export const save = () => novel;",
    'src/pages/library/index.ts': "export * from './ui/Page';",
    'src/pages/library/ui/Page.ts':
      "import { save } from '@/features/save'; export const Page = () => save();"
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  assert.deepEqual(await checkWebArchitecture(root), []);
});
