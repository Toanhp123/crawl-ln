import { parseOptions } from '../lib/arguments.mjs';
import { npmInvocation } from '../lib/npm.mjs';
import { resolveFrom } from '../lib/module-loader.mjs';
import { runChild } from '../lib/process-runner.mjs';
import { projectRoot } from '../lib/repository.mjs';

const SUITES = ['core', 'reader-engine', 'contract', 'regression', 'integration', 'e2e'];
const CORE_SUITES = ['reader-engine', 'contract', 'regression', 'integration'];
const PACKAGE_ORDER = ['shared', 'sdk', 'reader-engine'];
const REQUIRED_PACKAGES = {
  'reader-engine': ['reader-engine'],
  contract: ['shared', 'sdk', 'reader-engine'],
  regression: ['shared', 'sdk', 'reader-engine'],
  integration: ['shared', 'sdk', 'reader-engine'],
  e2e: []
};

function helpText() {
  return [
    'Usage: node scripts/cli.mjs test [--suite <name>]',
    '',
    'Test suites:',
    ...SUITES.map((suite) => `  ${suite}`),
    '',
    'The default core suite runs reader-engine, contract, regression, and integration.',
    'Browser E2E is explicit and requires a validated Chromium capability.',
    '',
    'Options:',
    '  --suite <name>  Run exactly one suite',
    '  --help          Show this help'
  ].join('\n');
}

export function testPlan(suite = 'core') {
  return suite === 'core' ? [...CORE_SUITES] : [suite];
}

function requiredPackages(plan) {
  const selected = new Set();
  for (const suite of plan) {
    for (const target of REQUIRED_PACKAGES[suite] ?? []) selected.add(target);
  }
  return PACKAGE_ORDER.filter((target) => selected.has(target));
}

async function defaultPrepare(targets) {
  const { prepareInternalPackages } = await import('../lib/internal-packages.mjs');
  return prepareInternalPackages(targets);
}

async function defaultRunReaderEngine({ signal } = {}) {
  await runChild({
    ...npmInvocation(['run', 'test', '--workspace', '@novel-tool/reader-engine']),
    cwd: projectRoot,
    stdio: 'inherit',
    signal,
    stage: 'reader-engine tests'
  });
}

async function defaultRunFileSuite(suite) {
  const { runTestSuite } = await import('../lib/test-runner.mjs');
  return runTestSuite(suite);
}

async function defaultProbeBrowser({ signal } = {}) {
  const { probeBrowserCapability } = await import('../lib/browser-capability.mjs');
  return probeBrowserCapability({ install: false, signal });
}

export function playwrightInvocation(root = projectRoot, resolver = resolveFrom) {
  return {
    command: process.execPath,
    args: [resolver(root, '@playwright/test/cli'), 'test']
  };
}

async function defaultRunPlaywright({ signal } = {}) {
  await runChild({
    ...playwrightInvocation(),
    cwd: projectRoot,
    stdio: 'inherit',
    signal,
    stage: 'browser E2E tests'
  });
}

export async function runTestPlan(plan, dependencies = {}) {
  const prepare = dependencies.prepare ?? defaultPrepare;
  const runReaderEngine = dependencies.runReaderEngine ?? defaultRunReaderEngine;
  const runFileSuite = dependencies.runFileSuite ?? defaultRunFileSuite;
  const probeBrowser = dependencies.probeBrowser ?? defaultProbeBrowser;
  const runPlaywright = dependencies.runPlaywright ?? defaultRunPlaywright;
  const stdout = dependencies.stdout ?? console.log;
  const signal = dependencies.signal;

  const packages = requiredPackages(plan);
  if (packages.length > 0) await prepare(packages);

  const totals = { tests: 0, pass: 0, fail: 0, skipped: 0 };
  for (const suite of plan) {
    stdout(`[test] ${suite}`);
    if (suite === 'reader-engine') {
      await runReaderEngine({ signal });
      continue;
    }
    if (suite === 'e2e') {
      await probeBrowser({ signal });
      await runPlaywright({ signal });
      continue;
    }
    const summary = await runFileSuite(suite, { signal });
    for (const key of Object.keys(totals)) totals[key] += Number(summary?.[key] ?? 0);
  }

  if (totals.tests > 0) {
    stdout(
      `[test] ${totals.tests} tests: ${totals.pass} pass, ${totals.fail} fail, ${totals.skipped} skipped`
    );
  }
  return totals;
}

export const testCommand = {
  name: 'test',
  summary: 'Run core or explicit browser test suites',
  async execute(argv, context = {}) {
    const { help, values } = parseOptions('test', argv, {
      suite: { type: 'string', choices: SUITES }
    });
    if (help) {
      (context.stdout ?? console.log)(helpText());
      return;
    }
    return runTestPlan(testPlan(values.suite), {
      stdout: context.stdout,
      signal: context.signal
    });
  }
};
