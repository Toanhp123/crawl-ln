import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const firstClass = [
  ['win32', 'x64'],
  ['win32', 'arm64'],
  ['darwin', 'x64'],
  ['darwin', 'arm64'],
  ['linux', 'x64'],
  ['linux', 'arm64'],
  ['android', 'arm64']
] as const;

test('setup accepts every first-class platform and rejects unsupported combinations early', async () => {
  const { validateSupportedPlatform } = await import('../../scripts/cli/lib/platform.mjs');
  for (const [platform, arch] of firstClass) {
    assert.doesNotThrow(() =>
      validateSupportedPlatform({
        platform,
        arch,
        glibcVersion: platform === 'linux' ? '2.39' : undefined
      })
    );
  }
  assert.equal(
    validateSupportedPlatform({ platform: 'linux', arch: 'x64', libc: 'musl' }).support,
    'best-effort'
  );
  assert.throws(
    () => validateSupportedPlatform({ platform: 'android', arch: 'x64' }),
    /android x64/
  );
});

test('runtime floors compare numeric tuples rather than strings', async () => {
  const { validateRuntime } = await import('../../scripts/cli/lib/platform.mjs');
  assert.doesNotThrow(() =>
    validateRuntime({ nodeVersion: ['v', '22.12.0'].join(''), npmVersion: '10.0.0' })
  );
  assert.throws(
    () => validateRuntime({ nodeVersion: ['v', '22.9.0'].join(''), npmVersion: '10.0.0' }),
    /Node\.js 22\.12\.0/
  );
  assert.throws(
    () => validateRuntime({ nodeVersion: ['v', '22.12.0'].join(''), npmVersion: '9.10.0' }),
    /npm 10\.0\.0/
  );
});

test('lockfile validation requires every first-class native package at the parent version', async () => {
  const { requiredNativePackages, validateLockfileObject } =
    await import('../../scripts/cli/lib/lockfile.mjs');
  const packages: Record<string, any> = {
    '': { workspaces: ['apps/*', 'packages/*'] },
    'node_modules/rolldown': { version: '1.1.5', optionalDependencies: {} },
    'node_modules/lightningcss': { version: '1.32.0', optionalDependencies: {} },
    'node_modules/esbuild': { version: '0.28.1', optionalDependencies: {} }
  };
  for (const item of requiredNativePackages) {
    const parent = packages[item.parent] as {
      version: string;
      optionalDependencies: Record<string, string>;
    };
    parent.optionalDependencies[item.name] = parent.version;
    packages[`node_modules/${item.name}`] = {
      version: parent.version,
      optional: true,
      os: [item.os],
      cpu: [item.cpu]
    };
  }
  const lock = { lockfileVersion: 3, packages };
  assert.doesNotThrow(() => validateLockfileObject(lock));
  delete packages['node_modules/@rolldown/binding-android-arm64'];
  assert.throws(() => validateLockfileObject(lock), /binding-android-arm64/);
});

test('host native selection distinguishes Linux glibc and musl', async () => {
  const { selectHostNativePackages } = await import('../../scripts/cli/lib/lockfile.mjs');
  const packages: Record<string, any> = {
    '': { workspaces: ['apps/*', 'packages/*'] },
    'node_modules/rolldown': {
      version: '1.1.5',
      optionalDependencies: {
        '@rolldown/binding-linux-x64-musl': '1.1.5'
      }
    },
    'node_modules/lightningcss': {
      version: '1.32.0',
      optionalDependencies: {
        'lightningcss-linux-x64-musl': '1.32.0'
      }
    },
    'node_modules/esbuild': {
      version: '0.28.1',
      optionalDependencies: { '@esbuild/linux-x64': '0.28.1' }
    },
    'node_modules/@rolldown/binding-linux-x64-musl': {
      version: '1.1.5',
      optional: true,
      os: ['linux'],
      cpu: ['x64']
    },
    'node_modules/lightningcss-linux-x64-musl': {
      version: '1.32.0',
      optional: true,
      os: ['linux'],
      cpu: ['x64']
    },
    'node_modules/@esbuild/linux-x64': {
      version: '0.28.1',
      optional: true,
      os: ['linux'],
      cpu: ['x64']
    }
  };
  const lock = { lockfileVersion: 3, packages };
  assert.deepEqual(
    selectHostNativePackages(lock, {
      platform: 'linux',
      arch: 'x64',
      libc: 'musl',
      support: 'best-effort'
    }),
    {
      rolldown: '@rolldown/binding-linux-x64-musl',
      lightningcss: 'lightningcss-linux-x64-musl',
      esbuild: '@esbuild/linux-x64'
    }
  );
  delete packages['node_modules/lightningcss-linux-x64-musl'];
  assert.throws(
    () =>
      selectHostNativePackages(lock, {
        platform: 'linux',
        arch: 'x64',
        libc: 'musl',
        support: 'best-effort'
      }),
    /linux.*x64.*musl/i
  );
});

test('lockfile validation rejects non-public HTTP registry hosts', async () => {
  const { requiredNativePackages, validateLockfileObject } =
    await import('../../scripts/cli/lib/lockfile.mjs');
  const packages: Record<string, any> = {
    '': { workspaces: ['apps/*', 'packages/*'] },
    'node_modules/rolldown': { version: '1.1.5', optionalDependencies: {} },
    'node_modules/lightningcss': { version: '1.32.0', optionalDependencies: {} },
    'node_modules/esbuild': { version: '0.28.1', optionalDependencies: {} }
  };
  for (const item of requiredNativePackages) {
    packages[item.parent].optionalDependencies[item.name] = packages[item.parent].version;
    packages[`node_modules/${item.name}`] = {
      version: packages[item.parent].version,
      optional: true,
      os: [item.os],
      cpu: [item.cpu]
    };
  }
  packages['node_modules/probe'] = {
    version: '1.0.0',
    resolved: 'https://example.invalid/probe.tgz'
  };
  assert.throws(() => validateLockfileObject({ lockfileVersion: 3, packages }), /example\.invalid/);
});

test('browser installation uses OS dependencies only on glibc Linux', async () => {
  const { browserInstallArguments } = await import('../../scripts/cli/lib/browser-capability.mjs');
  assert.deepEqual(browserInstallArguments({ platform: 'linux', arch: 'x64', libc: 'glibc' }), [
    'exec',
    '--',
    'playwright',
    'install',
    '--with-deps',
    'chromium'
  ]);
  assert.deepEqual(browserInstallArguments({ platform: 'darwin', arch: 'arm64' }), [
    'exec',
    '--',
    'playwright',
    'install',
    'chromium'
  ]);
});

test('Android browser probing requires an explicitly configured executable', async () => {
  const { probeBrowserCapability } = await import('../../scripts/cli/lib/browser-capability.mjs');
  await assert.rejects(
    () =>
      probeBrowserCapability({
        platformInfo: {
          platform: 'android',
          arch: 'arm64',
          support: 'first-class'
        },
        environment: {}
      }),
    /system Chromium executable.*android arm64/i
  );
});

test('setup help does not require installed third-party packages', async () => {
  const { setupCommand } = await import('../../scripts/cli/commands/setup.mjs');
  const lines: string[] = [];
  await setupCommand.execute(['--help'], { stdout: (line: string) => lines.push(line) });
  assert.match(lines.join('\n'), /--browser/);
});

test('setup creates the API environment from the tracked template', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-setup-env-'));
  try {
    const apiRoot = join(root, 'apps', 'api');
    const template = 'HOST=127.0.0.1\nPORT=3000\n';
    await mkdir(apiRoot, { recursive: true });
    await writeFile(join(apiRoot, '.env.example'), template);

    const { ensureApiEnvironment } = await import('../../scripts/cli/lib/api-environment.mjs');

    assert.equal(await ensureApiEnvironment({ root }), 'created');
    assert.equal(await readFile(join(apiRoot, '.env'), 'utf8'), template);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('setup preserves an existing API environment byte for byte', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-setup-env-existing-'));
  try {
    const apiRoot = join(root, 'apps', 'api');
    const existing = 'HOST=0.0.0.0\nAPI_REMOTE_TOKEN=keep-this-secret\n';
    await mkdir(apiRoot, { recursive: true });
    await writeFile(join(apiRoot, '.env.example'), 'HOST=127.0.0.1\n');
    await writeFile(join(apiRoot, '.env'), existing);

    const { ensureApiEnvironment } = await import('../../scripts/cli/lib/api-environment.mjs');

    assert.equal(await ensureApiEnvironment({ root }), 'existing');
    assert.equal(await readFile(join(apiRoot, '.env'), 'utf8'), existing);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('setup pipeline runs stages in the documented order', async () => {
  const { runSetup } = await import('../../scripts/cli/commands/setup.mjs');
  const trace: string[] = [];
  await runSetup({
    browser: true,
    stdout: (line: string) => trace.push(line),
    dependencies: {
      async runtime() {},
      platform() {
        return { platform: 'linux', arch: 'x64', libc: 'glibc', support: 'first-class' };
      },
      async readLockfile() {
        return { lockfileVersion: 3, packages: {} };
      },
      validateLockfile() {},
      selectHost() {
        return { rolldown: 'r', lightningcss: 'l', esbuild: 'e' };
      },
      async install() {},
      async probeNative() {},
      async probeBrowser() {}
    }
  });
  assert.deepEqual(
    trace.filter((line) => line.startsWith('[setup]')),
    [
      '[setup] validate-runtime',
      '[setup] detect-platform',
      '[setup] validate-lockfile',
      '[setup] install',
      '[setup] probe-native',
      '[setup] probe-browser'
    ]
  );
});
