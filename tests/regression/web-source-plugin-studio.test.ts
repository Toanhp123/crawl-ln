import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import ts from 'typescript';

const { createElement } = React;
(globalThis as typeof globalThis & { React: typeof React }).React = React;

function useTestLanguage(language: 'en' | 'vi') {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map([['novel-tool-language', language]]);
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value)
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  return () => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  };
}

function resolveWebModule(fromFile: string, specifier: string) {
  const raw = specifier.startsWith('@/')
    ? path.resolve('apps/web/src', specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(fromFile), specifier)
      : undefined;
  if (!raw) return undefined;
  return [raw, `${raw}.ts`, `${raw}.tsx`, path.join(raw, 'index.ts'), path.join(raw, 'index.tsx')]
    .map((candidate) => path.resolve(candidate))
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

async function collectStaticWebDependencies(entry: string) {
  const files = new Set<string>();
  const packages = new Set<string>();
  const pending = [path.resolve(entry)];

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || files.has(file)) continue;
    files.add(file);
    const source = await readFile(file, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) continue;
      const specifier =
        statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined;
      if (!specifier) continue;
      const resolved = resolveWebModule(file, specifier);
      if (resolved) pending.push(resolved);
      else if (!specifier.startsWith('@/') && !specifier.startsWith('.')) packages.add(specifier);
    }
  }

  return { files, packages };
}

test('Plugin Studio clients preserve draft, build, test and install contracts', async () => {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input), 'http://novel-tool.test').pathname;
    requests.push({ path, init });
    if (path.endsWith('/export')) {
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          'content-type': 'application/octet-stream',
          'content-disposition': 'attachment; filename="demo-reader.source-plugin"'
        }
      });
    }
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

    if (init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }

    return new Response(JSON.stringify({ data, error: null }), {
      status: path.endsWith('/install') ? 202 : path.endsWith('/projects') ? 201 : 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    const entity = await import('../../apps/web/src/entities/source-plugin-project/index.ts');
    const [
      createProject,
      deleteProject,
      editProject,
      buildProject,
      testProject,
      exportProject,
      installProject
    ] = await Promise.all([
      import('../../apps/web/src/features/create-source-plugin-project/index.ts'),
      import('../../apps/web/src/features/delete-source-plugin-project/index.ts'),
      import('../../apps/web/src/features/edit-source-plugin-project/index.ts'),
      import('../../apps/web/src/features/build-source-plugin-project/index.ts'),
      import('../../apps/web/src/features/test-source-plugin-project/index.ts'),
      import('../../apps/web/src/features/export-source-plugin-project/index.ts'),
      import('../../apps/web/src/features/install-source-plugin-project/index.ts')
    ]);
    await entity.listSourcePluginProjects();
    await createProject.createSourcePluginProject({
      name: 'Demo Reader',
      pluginId: 'demo-reader',
      version: '1.0.0',
      hosts: ['example.com'],
      capabilities: ['metadata'],
      selectors: { title: 'title' }
    });
    await entity.getSourcePluginProject('project/1');
    await editProject.updateSourcePluginProject('project/1', {
      expectedRevision: 1,
      files: { 'src/index.ts': 'export default {}' }
    });
    await buildProject.buildSourcePluginProject('project/1');
    await testProject.testSourcePluginProject('project/1');
    const artifact = await exportProject.exportSourcePluginProject('project/1');
    await installProject.installSourcePluginProject('project/1');
    await deleteProject.deleteSourcePluginProject('project/1');
    assert.equal(artifact.filename, 'demo-reader.source-plugin');
    assert.deepEqual([...artifact.content], [1, 2, 3]);
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.deepEqual(
    requests.map(({ path, init }) => ({ path, method: init?.method })),
    [
      { path: '/api/source-reader/studio/projects', method: undefined },
      { path: '/api/source-reader/studio/projects', method: 'POST' },
      { path: '/api/source-reader/studio/projects/project%2F1', method: undefined },
      { path: '/api/source-reader/studio/projects/project%2F1', method: 'PATCH' },
      { path: '/api/source-reader/studio/projects/project%2F1/build', method: 'POST' },
      { path: '/api/source-reader/studio/projects/project%2F1/test', method: 'POST' },
      { path: '/api/source-reader/studio/projects/project%2F1/export', method: undefined },
      { path: '/api/source-reader/studio/projects/project%2F1/install', method: 'POST' },
      { path: '/api/source-reader/studio/projects/project%2F1', method: 'DELETE' }
    ]
  );
});

test('installing a Studio project invalidates both project and installed-plugin queries', async () => {
  const [{ QueryClient }, projectEntity, pluginEntity, installProject] = await Promise.all([
    import('@tanstack/react-query'),
    import('../../apps/web/src/entities/source-plugin-project/index.ts'),
    import('../../apps/web/src/entities/source-plugin/index.ts'),
    import('../../apps/web/src/features/install-source-plugin-project/index.ts')
  ]);
  const client = new QueryClient();
  client.setQueryData(projectEntity.sourcePluginProjectKeys.list(), ['draft']);
  client.setQueryData(pluginEntity.sourcePluginKeys.list(), ['installed']);

  await installProject.invalidateInstalledSourcePluginProject(client);

  assert.equal(
    client.getQueryState(projectEntity.sourcePluginProjectKeys.list())?.isInvalidated,
    true
  );
  assert.equal(client.getQueryState(pluginEntity.sourcePluginKeys.list())?.isInvalidated, true);
});

test('Studio project import submits an explicit resolution and invalidates only project queries', async () => {
  const requests: Array<{ path: string; init?: RequestInit }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      path: new URL(String(input), 'http://novel-tool.test').pathname,
      init
    });
    return new Response(
      JSON.stringify({
        data: {
          id: 'project-1',
          name: 'Imported Reader',
          pluginId: 'imported-reader',
          version: '1.0.0',
          hosts: ['example.com'],
          capabilities: ['metadata'],
          selectors: {},
          files: { 'manifest.json': '{}', 'src/index.ts': 'export default {}' },
          revision: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        error: null
      }),
      { status: 201, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    const [{ QueryClient }, projectEntity, pluginEntity, importProject] = await Promise.all([
      import('@tanstack/react-query'),
      import('../../apps/web/src/entities/source-plugin-project/index.ts'),
      import('../../apps/web/src/entities/source-plugin/index.ts'),
      import('../../apps/web/src/features/import-source-plugin-project/index.ts')
    ]);
    const file = new File([Uint8Array.of(1, 2, 3)], 'source.zip', {
      type: 'application/zip'
    });
    const project = await importProject.importSourcePluginProject({
      file,
      expectedChecksum: 'b'.repeat(64),
      resolution: { type: 'create-copy' }
    });
    const client = new QueryClient();
    client.setQueryData(projectEntity.sourcePluginProjectKeys.list(), ['draft']);
    client.setQueryData(pluginEntity.sourcePluginKeys.list(), ['installed']);

    await importProject.invalidateImportedSourcePluginProject(client);

    assert.equal(project.pluginId, 'imported-reader');
    assert.equal(
      client.getQueryState(projectEntity.sourcePluginProjectKeys.list())?.isInvalidated,
      true
    );
    assert.equal(client.getQueryState(pluginEntity.sourcePluginKeys.list())?.isInvalidated, false);
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request?.path, '/api/source-reader/studio/projects/import');
  assert.equal(request?.init?.method, 'POST');
  assert.equal(new Headers(request?.init?.headers).get('content-type'), null);
  assert.equal((request?.init?.body as FormData).get('plugin') instanceof File, true);
  assert.deepEqual(JSON.parse(String((request?.init?.body as FormData).get('resolutionJson'))), {
    type: 'create-copy'
  });
  assert.equal((request?.init?.body as FormData).get('expectedChecksum'), 'b'.repeat(64));

  const graph = await collectStaticWebDependencies(
    'apps/web/src/features/import-source-plugin-project/index.ts'
  );
  assert.equal(
    [...graph.files].some((file) =>
      /features[\\/]install-source-plugin(?:-project)?[\\/]/.test(file)
    ),
    false
  );
  assert.equal(
    [...graph.files].some((file) => /features[\\/]build-source-plugin-project[\\/]/.test(file)),
    false
  );
});

test('Plugin Studio is a separate lazy route and uses Monaco with revision-aware saves', async () => {
  const [router, preload, studio, editor, workspace] = await Promise.all([
    readFile('apps/web/src/app/router/AppRouter.tsx', 'utf8'),
    readFile('apps/web/src/app/router/route-preload.ts', 'utf8'),
    readFile('apps/web/src/widgets/source-plugin-studio/ui/SourcePluginStudio.tsx', 'utf8'),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/editor/PluginCodeEditor.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/features/edit-source-plugin-project/model/source-plugin-workspace-controller.ts',
      'utf8'
    )
  ]);
  assert.match(router, /SourcePluginStudioPage/);
  assert.match(preload, /sourcePluginStudio/);
  assert.match(studio, /PluginStudioDashboard/);
  assert.match(studio, /PluginStudioWorkbench/);
  assert.doesNotMatch(studio, /CreateSourcePluginProjectForm/);
  assert.doesNotMatch(studio, /PluginStudioProjectLibrary/);
  assert.match(studio, /useSearchParams/);
  assert.match(studio, /useSourcePluginProjects/);
  assert.match(studio, /useSourcePluginProject/);
  assert.match(editor, /@monaco-editor\/react/);
  assert.match(workspace, /expectedRevision/);
});

test('the eager application catalog does not statically load Plugin Studio UI', async () => {
  const graph = await collectStaticWebDependencies('apps/web/src/app/i18n/catalog.ts');
  const studioUi = path.resolve(
    'apps/web/src/widgets/source-plugin-studio/ui/SourcePluginStudio.tsx'
  );

  assert.equal(graph.files.has(studioUi), false);
});

test('the Plugin Studio scaffold has no static dependency on Monaco', async () => {
  const graph = await collectStaticWebDependencies(
    'apps/web/src/widgets/source-plugin-studio/ui/SourcePluginStudio.tsx'
  );

  assert.equal(graph.packages.has('@monaco-editor/react'), false);
  assert.equal(graph.packages.has('monaco-editor'), false);
});

test('the Monaco environment routes Studio languages to their dedicated workers', async () => {
  const { configureSourcePluginStudioMonacoEnvironment } =
    await import('../../apps/web/src/widgets/source-plugin-studio/model/configure-source-plugin-studio-monaco-environment.ts');
  const target: {
    MonacoEnvironment?: { getWorker?: (workerId: string, label: string) => Worker };
  } = {};
  const worker = (kind: string) => ({ kind }) as unknown as Worker;

  configureSourcePluginStudioMonacoEnvironment(target, {
    editor: () => worker('editor'),
    json: () => worker('json'),
    typescript: () => worker('typescript')
  });

  const getWorker = target.MonacoEnvironment?.getWorker;
  assert.ok(getWorker);
  assert.equal((getWorker('worker', 'json') as unknown as { kind: string }).kind, 'json');
  assert.equal(
    (getWorker('worker', 'typescript') as unknown as { kind: string }).kind,
    'typescript'
  );
  assert.equal(
    (getWorker('worker', 'javascript') as unknown as { kind: string }).kind,
    'typescript'
  );
  assert.equal((getWorker('worker', 'markdown') as unknown as { kind: string }).kind, 'editor');
});

test('the Monaco editor accessible name includes the active file', async () => {
  const { sourcePluginCodeEditorAriaLabel } =
    await import('../../apps/web/src/widgets/source-plugin-studio/model/source-plugin-code-editor-accessibility.ts');

  const label = sourcePluginCodeEditorAriaLabel('src/index.ts', (key, params) => {
    assert.equal(key, 'pluginStudio.editorAriaLabel');
    return `Editing ${String(params?.file)}`;
  });

  assert.equal(label, 'Editing src/index.ts');
});

test('the project explorer exposes the selected file to assistive technology', async () => {
  const restoreLanguage = useTestLanguage('en');
  try {
    const [{ I18nProvider }, { PluginStudioExplorer }] = await Promise.all([
      import('../../apps/web/src/shared/i18n/index.ts'),
      import('../../apps/web/src/widgets/source-plugin-studio/ui/workbench/PluginStudioExplorer.tsx')
    ]);
    const html = renderToStaticMarkup(
      createElement(
        I18nProvider,
        {
          catalogs: {
            en: { 'pluginStudio.projectFiles': 'Project files' },
            vi: { 'pluginStudio.projectFiles': 'Project files' }
          }
        },
        createElement(PluginStudioExplorer, {
          files: ['manifest.json', 'src/index.ts'],
          selectedFile: 'src/index.ts',
          onSelect: () => undefined,
          onCreateFile: () => undefined,
          onCreateFolder: () => undefined,
          onRename: () => undefined,
          onDuplicate: () => undefined,
          onDelete: () => undefined
        })
      )
    );

    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  } finally {
    restoreLanguage();
  }
});

test('the capability picker exposes both selected and unselected toggle states', async () => {
  const restoreLanguage = useTestLanguage('en');
  try {
    const [{ I18nProvider }, { SourcePluginProjectCapabilityPicker }] = await Promise.all([
      import('../../apps/web/src/shared/i18n/index.ts'),
      import('../../apps/web/src/features/create-source-plugin-project/ui/SourcePluginProjectCapabilityPicker.tsx')
    ]);
    const labels = {
      'createSourcePluginProject.capability.identify': 'Identify',
      'createSourcePluginProject.capability.metadata': 'Metadata',
      'createSourcePluginProject.capability.chapter-list': 'Chapter list',
      'createSourcePluginProject.capability.chapter-content': 'Chapter content'
    };
    const html = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { catalogs: { en: labels, vi: labels } },
        createElement(SourcePluginProjectCapabilityPicker, {
          value: ['metadata'],
          onChange: () => undefined
        })
      )
    );

    assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
    assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 3);
  } finally {
    restoreLanguage();
  }
});

test('an explicit import resolution remains keyboard reachable before any choice is selected', async () => {
  const { SettingsOptionList } = await import('../../apps/web/src/shared/ui/index.ts');
  const html = renderToStaticMarkup(
    createElement(SettingsOptionList, {
      ariaLabel: 'Import resolution',
      value: undefined,
      items: [
        { id: 'create-copy', label: 'Create a separate project' },
        { id: 'update:project-1', label: 'Update existing project' }
      ],
      onChange: () => undefined
    })
  );

  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 0);
});

test('the create-project form takes its visible default name from i18n', async () => {
  const restoreLanguage = useTestLanguage('en');
  try {
    const [
      { QueryClient, QueryClientProvider },
      { I18nProvider },
      { CreateSourcePluginProjectForm }
    ] = await Promise.all([
      import('@tanstack/react-query'),
      import('../../apps/web/src/shared/i18n/index.ts'),
      import('../../apps/web/src/features/create-source-plugin-project/index.ts')
    ]);
    const client = new QueryClient();
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          I18nProvider,
          {
            catalogs: {
              en: { 'createSourcePluginProject.defaultName': 'Localized Source' },
              vi: { 'createSourcePluginProject.defaultName': 'Nguon da dia phuong hoa' }
            }
          },
          createElement(CreateSourcePluginProjectForm, { onCreated: () => undefined })
        )
      )
    );

    assert.match(html, /value="Localized Source"/);
    assert.doesNotMatch(html, /value="My Source"/);
  } finally {
    restoreLanguage();
  }
});

test('the Studio project table exposes reopen and delete actions', async () => {
  const restoreLanguage = useTestLanguage('en');
  try {
    const [{ QueryClient, QueryClientProvider }, { I18nProvider }, { PluginStudioProjectTable }] =
      await Promise.all([
        import('@tanstack/react-query'),
        import('../../apps/web/src/shared/i18n/index.ts'),
        import('../../apps/web/src/widgets/source-plugin-studio/ui/dashboard/PluginStudioProjectTable.tsx')
      ]);
    const labels = {
      'pluginStudio.columnName': 'Name',
      'pluginStudio.columnPluginId': 'Plugin ID',
      'pluginStudio.columnVersion': 'Version',
      'pluginStudio.columnDomains': 'Domains',
      'pluginStudio.columnCapabilities': 'Capabilities',
      'pluginStudio.columnUpdated': 'Last updated',
      'pluginStudio.columnActions': 'Actions',
      'pluginStudio.invalidManifestShort': 'Invalid manifest',
      'deleteSourcePluginProject.action': 'Delete',
      'deleteSourcePluginProject.confirmTitle': 'Delete project?',
      'deleteSourcePluginProject.confirmDescription': 'This draft will be removed.'
    };
    const projects = [
      {
        id: 'project-1',
        name: 'Demo Reader',
        pluginId: 'demo-reader',
        version: '1.0.0',
        hosts: ['example.com'],
        capabilities: ['metadata' as const],
        selectors: { title: 'title' },
        files: { 'src/index.ts': 'export default {}' },
        revision: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z'
      },
      {
        id: 'project-2',
        name: 'Second Reader',
        pluginId: 'second-reader',
        version: '2.0.0',
        hosts: ['second.example.com'],
        capabilities: ['chapter-content' as const],
        selectors: { chapterContent: 'article' },
        files: { 'src/index.ts': 'export default {}' },
        revision: 1,
        createdAt: '2026-01-03T00:00:00.000Z',
        updatedAt: '2026-01-04T00:00:00.000Z'
      }
    ];
    const client = new QueryClient();
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          I18nProvider,
          { catalogs: { en: labels, vi: labels } },
          createElement(PluginStudioProjectTable, {
            projects,
            onOpen: () => undefined,
            onDeleted: () => undefined,
            onCreate: () => undefined
          })
        )
      )
    );

    assert.match(html, /<table/);
    assert.match(html, /Plugin ID/);
    assert.match(html, /Demo Reader/);
    assert.match(html, /demo-reader/);
    assert.match(html, /Second Reader/);
    assert.match(html, /second-reader/);
    assert.equal((html.match(/Delete/g) ?? []).length, 2);
  } finally {
    restoreLanguage();
  }
});
