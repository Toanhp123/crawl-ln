import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectTypeScriptFiles(path)));
    else if (entry.isFile() && path.endsWith('.ts')) files.push(path);
  }
  return files;
}

test('NovelCool exists only as an external workspace plugin', async () => {
  const sourceReaderModule = await readFile(
    'apps/api/src/modules/source-reader/source-reader.module.ts',
    'utf8'
  );
  assert.doesNotMatch(sourceReaderModule, /novelCoolPlugin|built-in\/novelcool/);
  await assert.rejects(
    () => access('apps/api/src/modules/source-reader/infrastructure/plugins/built-in/novelcool'),
    { code: 'ENOENT' }
  );
});

test('plugin source never imports API or web internals', async () => {
  for (const file of await collectTypeScriptFiles('plugins/novelcool/src')) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /(?:from|import\()\s*['"][^'"]*(?:apps\/api|apps\/web)/);
  }
});

test('setup, start and full build never install or activate NovelCool', async () => {
  const [setup, start, build] = await Promise.all([
    readFile('scripts/cli/commands/setup.mjs', 'utf8'),
    readFile('scripts/cli/commands/start.mjs', 'utf8'),
    readFile('scripts/cli/commands/build.mjs', 'utf8')
  ]);

  assert.doesNotMatch(setup, /novelcool|source-plugin.*install|plugin.*activat/i);
  assert.doesNotMatch(start, /novelcool|source-plugin.*install|plugin.*activat/i);
  assert.doesNotMatch(
    build,
    /PluginInstallationService|PluginActivationService|InstallSourcePluginUseCase|EnablePluginUseCase/
  );
});
