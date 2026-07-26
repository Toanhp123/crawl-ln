import assert from 'node:assert/strict';
import test from 'node:test';

test('default core graph excludes Playwright and preserves explicit suite order', async () => {
  const { testPlan } = await import('../../scripts/cli/commands/test.mjs');
  assert.deepEqual(testPlan(), [
    'reader-engine',
    'plugins',
    'contract',
    'regression',
    'integration'
  ]);
  assert.deepEqual(testPlan('core'), [
    'reader-engine',
    'plugins',
    'contract',
    'regression',
    'integration'
  ]);
  assert.deepEqual(testPlan('plugins'), ['plugins']);
  assert.deepEqual(testPlan('e2e'), ['e2e']);
  assert.equal(testPlan().includes('e2e'), false);
});

test('every file-based suite fails instead of passing when discovery returns zero tests', async () => {
  const { collectTestFiles, assertNonEmptySuite } =
    await import('../../scripts/cli/lib/test-runner.mjs');
  assert.deepEqual(await collectTestFiles(new URL('./missing/', import.meta.url)), []);
  assert.throws(() => assertNonEmptySuite('regression', []), /zero test files/i);
});

test('test command accepts exactly the approved suites', async () => {
  const { testCommand } = await import('../../scripts/cli/commands/test.mjs');
  const lines: string[] = [];
  await testCommand.execute(['--help'], { stdout: (line: string) => lines.push(line) });
  const help = lines.join('\n');
  for (const suite of [
    'core',
    'reader-engine',
    'plugins',
    'contract',
    'regression',
    'integration',
    'e2e'
  ]) {
    assert.match(help, new RegExp(suite));
  }
  await assert.rejects(() => testCommand.execute(['--suite', 'unit']), /Unknown value/);
});

test('core execution never probes or launches a browser', async () => {
  const { runTestPlan, testPlan } = await import('../../scripts/cli/commands/test.mjs');
  const trace: string[] = [];
  await runTestPlan(testPlan(), {
    prepare: async (targets: string[]) => trace.push(`prepare:${targets.join(',')}`),
    runReaderEngine: async () => trace.push('reader-engine'),
    runPlugins: async () => trace.push('plugins'),
    runFileSuite: async (suite: string) => {
      trace.push(suite);
      return { tests: 1, pass: 1, fail: 0, skipped: 0 };
    },
    probeBrowser: async () => trace.push('browser-probe'),
    runPlaywright: async () => trace.push('playwright'),
    stdout() {}
  });
  assert.deepEqual(trace, [
    'prepare:shared,sdk,reader-engine',
    'reader-engine',
    'plugins',
    'contract',
    'regression',
    'integration'
  ]);
});

test('plugins suite prepares the public SDK and runs only the first-party plugin workspace', async () => {
  const { runTestPlan, testPlan } = await import('../../scripts/cli/commands/test.mjs');
  const trace: string[] = [];
  await runTestPlan(testPlan('plugins'), {
    prepare: async (targets: string[]) => trace.push(`prepare:${targets.join(',')}`),
    runReaderEngine: async () => trace.push('reader-engine'),
    runPlugins: async () => trace.push('plugins'),
    runFileSuite: async () => ({ tests: 0, pass: 0, fail: 0, skipped: 0 }),
    stdout() {}
  });
  assert.deepEqual(trace, ['prepare:sdk', 'plugins']);
});

test('explicit E2E fails at capability probe and never launches Playwright after failure', async () => {
  const { runTestPlan, testPlan } = await import('../../scripts/cli/commands/test.mjs');
  const trace: string[] = [];
  await assert.rejects(
    () =>
      runTestPlan(testPlan('e2e'), {
        prepare: async () => trace.push('prepare'),
        runReaderEngine: async () => trace.push('reader-engine'),
        runFileSuite: async () => ({ tests: 0, pass: 0, fail: 0, skipped: 0 }),
        probeBrowser: async () => {
          trace.push('browser-probe');
          throw new Error('Chromium unavailable');
        },
        runPlaywright: async () => trace.push('playwright'),
        stdout() {}
      }),
    /Chromium unavailable/
  );
  assert.deepEqual(trace, ['browser-probe']);
});

test('E2E resolves the @playwright/test CLI instead of an ambiguous playwright binary', async () => {
  const { playwrightInvocation } = await import('../../scripts/cli/commands/test.mjs');
  const calls: Array<[string, string]> = [];
  const invocation = playwrightInvocation('/repo', (base: string, specifier: string) => {
    calls.push([base, specifier]);
    return '/resolved/playwright-test-cli.js';
  });
  assert.deepEqual(calls, [['/repo', '@playwright/test/cli']]);
  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args, ['/resolved/playwright-test-cli.js', 'test']);
});
