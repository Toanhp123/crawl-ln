import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

type PackageJson = {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
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
  const [api, web, shared, sdk, reader] = await Promise.all([
    readPackage('apps/api/package.json'),
    readPackage('apps/web/package.json'),
    readPackage('packages/shared/package.json'),
    readPackage('packages/source-plugin-sdk/package.json'),
    readPackage('packages/reader-engine/package.json')
  ]);
  assert.deepEqual(Object.keys(api.scripts ?? {}), ['dev', 'build', 'start', 'check']);
  assert.deepEqual(Object.keys(web.scripts ?? {}), ['dev', 'build', 'check']);
  assert.deepEqual(Object.keys(shared.scripts ?? {}), ['build', 'check']);
  assert.deepEqual(Object.keys(sdk.scripts ?? {}), ['build', 'check']);
  assert.deepEqual(Object.keys(reader.scripts ?? {}), ['build', 'check', 'test']);
});

test('no package script uses retired aliases, shells, orchestration, or physical dependency paths', async () => {
  const packages = await Promise.all(
    [
      'package.json',
      'apps/api/package.json',
      'apps/web/package.json',
      'packages/shared/package.json',
      'packages/source-plugin-sdk/package.json',
      'packages/reader-engine/package.json'
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
