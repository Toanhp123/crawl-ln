import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Plugin Studio clients preserve draft, build, test and install contracts', async () => {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input), 'http://novel-tool.test').pathname;
    requests.push({ path, init });
    const data = path.endsWith('/build')
      ? { revision: 1, stale: false }
      : path.endsWith('/test')
        ? { status: 'healthy', checks: ['verified'] }
        : path.endsWith('/install')
          ? { pluginId: 'demo-reader', version: '1.0.0', status: 'pending-approval' }
          : {
              id: 'project-1',
              name: 'Demo Reader',
              pluginId: 'demo-reader',
              version: '1.0.0',
              hosts: ['example.com'],
              capabilities: ['metadata'],
              selectors: { title: 'title' },
              files: { 'manifest.json': '{}', 'src/index.ts': 'export default {}' },
              revision: 1,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z'
            };
    return new Response(JSON.stringify({ data, error: null }), {
      status: path.endsWith('/install') ? 202 : path.endsWith('/projects') ? 201 : 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    const entity = await import('../../apps/web/src/entities/source-plugin-project/index.ts');
    const feature =
      await import('../../apps/web/src/features/manage-source-plugin-project/index.ts');
    await feature.createSourcePluginProject({
      name: 'Demo Reader',
      pluginId: 'demo-reader',
      version: '1.0.0',
      hosts: ['example.com'],
      capabilities: ['metadata'],
      selectors: { title: 'title' }
    });
    await entity.getSourcePluginProject('project/1');
    await feature.updateSourcePluginProject('project/1', {
      expectedRevision: 1,
      files: { 'src/index.ts': 'export default {}' }
    });
    await feature.buildSourcePluginProject('project/1');
    await feature.testSourcePluginProject('project/1');
    await feature.installSourcePluginProject('project/1');
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.deepEqual(
    requests.map(({ path, init }) => ({ path, method: init?.method })),
    [
      { path: '/api/source-reader/studio/projects', method: 'POST' },
      { path: '/api/source-reader/studio/projects/project%2F1', method: undefined },
      { path: '/api/source-reader/studio/projects/project%2F1', method: 'PATCH' },
      { path: '/api/source-reader/studio/projects/project%2F1/build', method: 'POST' },
      { path: '/api/source-reader/studio/projects/project%2F1/test', method: 'POST' },
      { path: '/api/source-reader/studio/projects/project%2F1/install', method: 'POST' }
    ]
  );
});

test('Plugin Studio is a separate lazy route and uses Monaco with revision-aware saves', async () => {
  const [router, preload, widget] = await Promise.all([
    readFile('apps/web/src/app/router/AppRouter.tsx', 'utf8'),
    readFile('apps/web/src/app/router/route-preload.ts', 'utf8'),
    readFile('apps/web/src/widgets/source-plugin-studio/ui/SourcePluginStudio.tsx', 'utf8')
  ]);
  assert.match(router, /SourcePluginStudioPage/);
  assert.match(preload, /sourcePluginStudio/);
  assert.match(widget, /@monaco-editor\/react/);
  assert.match(widget, /expectedRevision/);
});
