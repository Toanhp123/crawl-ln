import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createSourcePluginStudioFile,
  deleteSourcePluginStudioFile,
  duplicateSourcePluginStudioFile,
  renameSourcePluginStudioFile,
  validateSourcePluginStudioFilePath
} from '../../apps/web/src/features/edit-source-plugin-project/model/source-plugin-workspace-files.ts';

const files = {
  'manifest.json': '{}',
  'src/index.ts': 'index',
  'src/parser.ts': 'parser',
  'tests/smoke.test.ts': 'test'
};

test('Studio file paths are restricted to safe source and test paths', () => {
  for (const path of ['src/new.ts', 'src/parsers/site.ts', 'tests/site.test.ts']) {
    assert.equal(validateSourcePluginStudioFilePath(path), path);
  }
  for (const path of ['', '/src/a.ts', 'src\\a.ts', 'src/../a.ts', 'docs/a.ts', 'manifest.json']) {
    assert.throws(() => validateSourcePluginStudioFilePath(path));
  }
});

test('create adds a unique empty file without mutating the input map', () => {
  const result = createSourcePluginStudioFile(files, 'src/new.ts');
  assert.equal(result['src/new.ts'], '');
  assert.equal(files['src/new.ts'], undefined);
  assert.throws(() => createSourcePluginStudioFile(files, 'src/index.ts'), /already exists/i);
});

test('rename moves content and protects manifest.json', () => {
  const result = renameSourcePluginStudioFile(files, 'src/parser.ts', 'src/parsers/site.ts');
  assert.equal(result['src/parser.ts'], undefined);
  assert.equal(result['src/parsers/site.ts'], 'parser');
  assert.throws(() => renameSourcePluginStudioFile(files, 'manifest.json', 'src/manifest.ts'));
});

test('duplicate derives a copy path and refuses manifest.json', () => {
  const result = duplicateSourcePluginStudioFile(files, 'src/parser.ts');
  assert.equal(result.path, 'src/parser.copy.ts');
  assert.equal(result.files[result.path], 'parser');
  assert.throws(() => duplicateSourcePluginStudioFile(files, 'manifest.json'));
});

test('delete removes a file while keeping manifest.json protected', () => {
  const result = deleteSourcePluginStudioFile(files, 'src/parser.ts');
  assert.equal(result['src/parser.ts'], undefined);
  assert.throws(() => deleteSourcePluginStudioFile(files, 'manifest.json'));
});

test('file tree exposes create, rename, duplicate and delete actions', async () => {
  const [tree, workbench] = await Promise.all([
    readFile('apps/web/src/widgets/source-plugin-studio/ui/PluginProjectFileTree.tsx', 'utf8'),
    readFile('apps/web/src/widgets/source-plugin-studio/ui/PluginStudioWorkbench.tsx', 'utf8')
  ]);
  assert.match(tree, /onCreateFile/);
  assert.match(tree, /onCreateFolder/);
  assert.match(tree, /onRename/);
  assert.match(tree, /onDuplicate/);
  assert.match(tree, /onDelete/);
  assert.match(workbench, /createFile/);
  assert.match(workbench, /renameFile/);
  assert.match(workbench, /duplicateFile/);
  assert.match(workbench, /deleteFile/);
});

import type { SourcePluginProject } from '../../apps/web/src/entities/source-plugin-project/model/types.ts';
import { createSourcePluginWorkspaceController } from '../../apps/web/src/features/edit-source-plugin-project/model/source-plugin-workspace-controller.ts';

function workspaceProject(): SourcePluginProject {
  return {
    id: 'project-files',
    name: 'Files',
    pluginId: 'files',
    version: '1.0.0',
    hosts: ['example.com'],
    capabilities: ['metadata'],
    selectors: {},
    files: { ...files },
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

test('workspace file operations update selection and persist through the normal save queue', async () => {
  let savedFiles: Record<string, string> | undefined;
  const controller = createSourcePluginWorkspaceController({
    project: workspaceProject(),
    save: async (input) => {
      savedFiles = input.files;
      return { ...workspaceProject(), files: input.files, revision: input.expectedRevision + 1 };
    }
  });

  controller.createFile('src/new.ts');
  assert.equal(controller.getSnapshot().selectedFile, 'src/new.ts');
  controller.renameFile('src/new.ts', 'src/renamed.ts');
  assert.equal(controller.getSnapshot().selectedFile, 'src/renamed.ts');
  const copyPath = controller.duplicateFile('src/renamed.ts');
  assert.equal(copyPath, 'src/renamed.copy.ts');
  assert.equal(controller.getSnapshot().selectedFile, copyPath);
  controller.deleteFile(copyPath);
  assert.equal(controller.getSnapshot().selectedFile, 'src/index.ts');
  assert.equal(controller.getSnapshot().status, 'dirty');

  await controller.flush();
  assert.equal(savedFiles?.['src/renamed.ts'], '');
  assert.equal(savedFiles?.[copyPath], undefined);
  assert.equal(controller.getSnapshot().status, 'saved');
});
