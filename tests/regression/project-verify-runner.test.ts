import assert from 'node:assert/strict';
import test from 'node:test';

test('verify runner executes canonical gates without nested npm test scripts', async () => {
  const { verificationSteps } = await import('../../scripts/verify.mjs');

  assert.deepEqual(
    verificationSteps.map((step) =>
      step.type === 'command'
        ? `${step.args[1]}`
        : step.type === 'suite'
          ? `suite:${step.name}`
          : `module:${step.name}`
    ),
    [
      'check:lockfile',
      'prepare:shared',
      'suite:regression',
      'suite:integration',
      'module:check:prepared',
      'module:build:prepared'
    ]
  );
});
