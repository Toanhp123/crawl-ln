import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('named options reject positional, repeated, unknown, and invalid values', async () => {
  const { parseOptions } = await import('../../scripts/cli/lib/arguments.mjs');
  const schema = {
    target: { type: 'string', choices: ['api', 'web'] },
    browser: { type: 'boolean' }
  } as const;

  assert.deepEqual(parseOptions('dev', ['--target', 'api'], schema), {
    help: false,
    values: { target: 'api' }
  });
  assert.deepEqual(parseOptions('dev', ['--browser'], schema), {
    help: false,
    values: { browser: true }
  });
  assert.deepEqual(parseOptions('dev', ['--help'], schema), { help: true, values: {} });
  assert.throws(() => parseOptions('dev', ['api'], schema), /Unexpected positional argument/);
  assert.throws(() => parseOptions('dev', ['--target=api'], schema), /does not accept =/);
  assert.throws(() => parseOptions('dev', ['--target'], schema), /requires a value/);
  assert.throws(() => parseOptions('dev', ['--target', 'desktop'], schema), /api, web/);
  assert.throws(() => parseOptions('dev', ['--target', 'api', '--target', 'web'], schema), /once/);
  assert.throws(() => parseOptions('dev', ['--wat'], schema), /Unknown option/);
});

test('dispatcher lazy-loads only the selected command and normalizes exit codes', async () => {
  const { CommandFailure, CommandInterrupted, CommandUsageError } =
    await import('../../scripts/cli/lib/errors.mjs');
  const { executeCli } = await import('../../scripts/cli.mjs');
  const loaded: string[] = [];
  const output: string[] = [];
  const registry = new Map([
    [
      'alpha',
      async () => {
        loaded.push('alpha');
        return {
          name: 'alpha',
          summary: 'alpha command',
          async execute(argv: string[]) {
            assert.deepEqual(argv, ['--flag']);
          }
        };
      }
    ],
    [
      'beta',
      async () => {
        loaded.push('beta');
        throw new Error('beta must not load');
      }
    ]
  ]);

  assert.equal(
    await executeCli(['alpha', '--flag'], {
      registry,
      stdout: (value: string) => output.push(value),
      stderr: (value: string) => output.push(value)
    }),
    0
  );
  assert.deepEqual(loaded, ['alpha']);
  assert.equal(await executeCli(['missing'], { registry, stdout() {}, stderr() {} }), 2);

  for (const [error, code] of [
    [new CommandUsageError('bad usage'), 2],
    [new CommandFailure('failed'), 1],
    [new CommandInterrupted(), 130]
  ] as const) {
    const failingRegistry = new Map([
      [
        'fail',
        async () => ({
          name: 'fail',
          summary: 'failure',
          async execute() {
            throw error;
          }
        })
      ]
    ]);
    assert.equal(
      await executeCli(['fail'], {
        registry: failingRegistry,
        stdout() {},
        stderr() {}
      }),
      code
    );
  }
});

test('dispatcher maps an injected abort to exit 130 after command cleanup', async () => {
  const { CommandInterrupted } = await import('../../scripts/cli/lib/errors.mjs');
  const { executeCli } = await import('../../scripts/cli.mjs');
  const controller = new AbortController();
  let cleaned = false;
  const registry = new Map([
    [
      'wait',
      async () => ({
        name: 'wait',
        summary: 'wait command',
        async execute(_argv: string[], context: { signal?: AbortSignal }) {
          await new Promise<void>((_resolve, reject) => {
            context.signal?.addEventListener(
              'abort',
              () => {
                cleaned = true;
                reject(new CommandInterrupted());
              },
              { once: true }
            );
          });
        }
      })
    ]
  ]);

  const result = executeCli(['wait'], {
    registry,
    signal: controller.signal,
    stdout() {},
    stderr() {}
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  assert.equal(await result, 130);
  assert.equal(cleaned, true);
});

test('workspace package resolution uses package metadata rather than a physical bin path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-module-loader-'));
  try {
    const workspace = join(root, 'apps', 'web');
    const packageRoot = join(workspace, 'node_modules', 'probe-package');
    await mkdir(packageRoot, { recursive: true });
    await writeFile(join(workspace, 'package.json'), '{"type":"module"}');
    await writeFile(
      join(packageRoot, 'package.json'),
      '{"name":"probe-package","type":"module","exports":"./index.js"}'
    );
    await writeFile(join(packageRoot, 'index.js'), 'export const value = 42;');
    const { importFrom, resolveFrom } = await import('../../scripts/cli/lib/module-loader.mjs');
    assert.match(resolveFrom(workspace, 'probe-package'), /probe-package[\\/]index\.js$/);
    assert.equal((await importFrom(workspace, 'probe-package')).value, 42);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('npm invocation uses the npm CLI path supplied by npm', async () => {
  const { currentNpmCli, npmInvocation } = await import('../../scripts/cli/lib/npm.mjs');
  const environment = { npm_execpath: '/portable/npm-cli.js' };
  assert.equal(currentNpmCli(environment), '/portable/npm-cli.js');
  assert.deepEqual(npmInvocation(['ci'], environment), {
    command: process.execPath,
    args: ['/portable/npm-cli.js', 'ci']
  });
  assert.throws(() => currentNpmCli({}), /npm_execpath is unavailable/);
});

test('runChild reports failure and interruption without a shell', async () => {
  const { CommandInterrupted } = await import('../../scripts/cli/lib/errors.mjs');
  const { runChild } = await import('../../scripts/cli/lib/process-runner.mjs');

  await assert.rejects(
    () =>
      runChild({
        command: process.execPath,
        args: ['-e', 'process.exit(7)'],
        cwd: process.cwd(),
        stdio: 'ignore',
        stage: 'fixture'
      }),
    /fixture.*code 7/i
  );

  const controller = new AbortController();
  const running = runChild({
    command: process.execPath,
    args: ['-e', 'setInterval(() => {}, 1000)'],
    cwd: process.cwd(),
    stdio: 'ignore',
    signal: controller.signal,
    stage: 'interrupt fixture'
  });
  setTimeout(() => controller.abort(), 25);
  await assert.rejects(running, (error: unknown) => error instanceof CommandInterrupted);
});
