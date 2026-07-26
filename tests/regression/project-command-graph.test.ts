import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

type PackageJson = {
  private?: boolean;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[];
};

const publicCommands = ['setup', 'dev', 'build', 'start', 'check', 'test', 'format', 'clean'];
const expected = Object.fromEntries(
  publicCommands.map((command) => [command, `node scripts/cli.mjs ${command}`])
);

async function readPackage(path: string): Promise<PackageJson> {
  return JSON.parse(
    await readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
  ) as PackageJson;
}

function runCli(command: string, option: string) {
  return spawnSync(process.execPath, ['scripts/cli.mjs', command, option], {
    cwd: new URL('../..', import.meta.url),
    encoding: 'utf8'
  });
}

test('root exposes exactly the eight canonical commands', async () => {
  const root = await readPackage('package.json');
  assert.deepEqual(root.scripts, expected);
  assert.deepEqual(root.workspaces, ['apps/*', 'packages/*', 'plugins/*']);
  assert.equal(root.devDependencies?.concurrently, undefined);
});

test('all public commands support help and reject unknown options before work starts', () => {
  for (const command of publicCommands) {
    const help = runCli(command, '--help');
    assert.equal(help.status, 0, `${command} help: ${help.stdout}\n${help.stderr}`);
    const invalid = runCli(command, '--unknown');
    assert.equal(invalid.status, 2, `${command} unknown: ${invalid.stdout}\n${invalid.stderr}`);
    assert.match(invalid.stderr, /Unknown option/);
  }
});

test('workspace scripts are private and capability-oriented', async () => {
  const [api, web, shared, sdk, reader, novelcool] = await Promise.all([
    readPackage('apps/api/package.json'),
    readPackage('apps/web/package.json'),
    readPackage('packages/shared/package.json'),
    readPackage('packages/source-plugin-sdk/package.json'),
    readPackage('packages/reader-engine/package.json'),
    readPackage('plugins/novelcool/package.json')
  ]);
  assert.deepEqual(Object.keys(api.scripts ?? {}), ['dev', 'build', 'start', 'check']);
  assert.deepEqual(Object.keys(web.scripts ?? {}), ['dev', 'build', 'check']);
  assert.deepEqual(Object.keys(shared.scripts ?? {}), ['build', 'check']);
  assert.deepEqual(Object.keys(sdk.scripts ?? {}), ['build', 'check']);
  assert.deepEqual(Object.keys(reader.scripts ?? {}), ['build', 'check', 'test']);
  assert.equal(novelcool.private, true);
  assert.deepEqual(Object.keys(novelcool.scripts ?? {}), ['build', 'check', 'test']);
});

test('no package script uses retired aliases, shells, orchestration, or physical dependency paths', async () => {
  const packages = await Promise.all(
    [
      'package.json',
      'apps/api/package.json',
      'apps/web/package.json',
      'packages/shared/package.json',
      'packages/source-plugin-sdk/package.json',
      'packages/reader-engine/package.json',
      'plugins/novelcool/package.json'
    ].map(readPackage)
  );
  const forbidden = [
    ['prepare', ''].join(':'),
    ['', 'prepared'].join(':'),
    ['node', '_modules/'].join(''),
    ['.', 'sh'].join(''),
    ['ba', 'sh'].join(''),
    ['power', 'shell'].join(''),
    ['con', 'currently'].join('')
  ];
  for (const packageJson of packages) {
    for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
      const text = `${name} ${command}`.replaceAll('\\', '/').toLowerCase();
      for (const token of forbidden) assert.equal(text.includes(token), false, `${name}: ${token}`);
    }
  }
});

test('plugin command implementations do not embed a concrete provider identity', async () => {
  const sources = await Promise.all(
    ['build.mjs', 'check.mjs', 'test.mjs', 'clean.mjs'].map((file) =>
      readFile(new URL(`../../scripts/cli/commands/${file}`, import.meta.url), 'utf8')
    )
  );
  for (const source of sources) assert.doesNotMatch(source, /novelcool/i);
});

test('type checks include discovered plugin projects and accept zero plugin workspaces', async () => {
  const { runStaticGroup } = await import('../../scripts/cli/commands/check.mjs');
  const root = resolve('fixture-repository');
  const pluginConfig = join(root, 'plugins', 'fixture-source', 'tsconfig.json');
  const checked: string[] = [];
  const baseConfigs = [
    'packages/shared/tsconfig.json',
    'packages/source-plugin-sdk/tsconfig.json',
    'packages/reader-engine/tsconfig.json',
    'apps/api/tsconfig.check.json',
    'apps/web/tsconfig.json'
  ].map((path) => join(root, path));

  await runStaticGroup('types', {
    root,
    discoverSourcePluginWorkspaces: async () => [{ tsconfigPath: pluginConfig }],
    checkTypeScriptProject: (path: string) => checked.push(path),
    stdout() {}
  });
  assert.deepEqual(checked, [...baseConfigs, pluginConfig]);

  checked.length = 0;
  await runStaticGroup('types', {
    root,
    discoverSourcePluginWorkspaces: async () => [],
    checkTypeScriptProject: (path: string) => checked.push(path),
    stdout() {}
  });
  assert.deepEqual(checked, baseConfigs);
});
