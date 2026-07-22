import assert from 'node:assert/strict';
import test from 'node:test';

test('verify runner executes canonical gates without nested npm test scripts', async () => {
  const { verificationSteps } = await import('../../scripts/verify.mjs');

  for (const step of verificationSteps) {
    if (step.type === 'command') assert.equal(step.command, process.execPath);
  }

  assert.deepEqual(
    verificationSteps.map((step) =>
      step.type === 'command' ? `command:${step.name}` : `suite:${step.name}`
    ),
    [
      'command:check:lockfile',
      'command:prepare:packages',
      'command:check:prepared',
      'command:build:prepared',
      'suite:contract',
      'suite:regression',
      'suite:integration'
    ]
  );
});
