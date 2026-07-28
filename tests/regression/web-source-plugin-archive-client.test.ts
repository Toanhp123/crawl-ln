import assert from 'node:assert/strict';
import { QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { createQueryClient } from '../../apps/web/src/shared/api/index.ts';
import { installSourcePluginCatalogs } from '../../apps/web/src/features/install-source-plugin/i18n/catalog.ts';
import { I18nProvider } from '../../apps/web/src/shared/i18n/index.ts';

(globalThis as typeof globalThis & { React: typeof React }).React = React;
(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
  getItem: () => 'en',
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0
};

const origin = 'http://novel-tool.test';

function pathOf(input: string | URL | Request): string {
  const value = input instanceof Request ? input.url : String(input);
  return new URL(value, origin).pathname;
}

test('source plugin archive clients inspect and confirm the same file with its checksum', async () => {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ path: pathOf(input), init });
    const data = pathOf(input).endsWith('/inspect')
      ? {
          checksum: 'a'.repeat(64),
          kind: 'studio-source',
          pluginId: 'fixture',
          name: 'Fixture',
          version: '1.0.0',
          hosts: ['fixture.example'],
          capabilities: ['identify'],
          files: ['manifest.json', 'src/index.ts'],
          ignoredFiles: ['README.md'],
          conflicts: []
        }
      : { pluginId: 'fixture', version: '1.0.0', status: 'pending-approval' };
    return new Response(JSON.stringify({ data, error: null }), {
      status: pathOf(input).endsWith('/inspect') ? 200 : 202,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    const { inspectSourcePluginArchive } =
      await import('../../apps/web/src/entities/source-plugin-archive/index.ts');
    const { installSourcePluginArchive } =
      await import('../../apps/web/src/features/install-source-plugin/index.ts');
    const file = new File([Uint8Array.of(1, 2, 3)], 'fixture.zip', {
      type: 'application/zip'
    });

    const preview = await inspectSourcePluginArchive(file);
    const result = await installSourcePluginArchive(file, preview.checksum);

    assert.equal(preview.kind, 'studio-source');
    assert.equal(result.status, 'pending-approval');
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map((request) => ({
      path: request.path,
      method: request.init?.method,
      contentType: new Headers(request.init?.headers).get('content-type'),
      plugin:
        request.init?.body instanceof FormData
          ? (request.init.body.get('plugin') as File | null)?.name
          : undefined,
      expectedChecksum:
        request.init?.body instanceof FormData
          ? request.init.body.get('expectedChecksum')
          : undefined
    })),
    [
      {
        path: '/api/source-reader/plugins/import/inspect',
        method: 'POST',
        contentType: null,
        plugin: 'fixture.zip',
        expectedChecksum: null
      },
      {
        path: '/api/source-reader/plugins/import/install',
        method: 'POST',
        contentType: null,
        plugin: 'fixture.zip',
        expectedChecksum: 'a'.repeat(64)
      }
    ]
  );
});

test('install form exposes the shared drop picker before an archive is inspected', async () => {
  const { InstallSourcePluginForm } =
    await import('../../apps/web/src/features/install-source-plugin/ui/InstallSourcePluginForm.tsx');
  const html = renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: createQueryClient() },
      React.createElement(
        I18nProvider,
        { catalogs: installSourcePluginCatalogs },
        React.createElement(InstallSourcePluginForm, { surface: 'plain' })
      )
    )
  );

  assert.match(html, /type="file"/);
  assert.match(html, /or drop it here/);
  assert.match(html, /No file selected/);
  assert.doesNotMatch(html, /Install plugin/);
});
