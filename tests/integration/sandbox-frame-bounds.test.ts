import assert from 'node:assert/strict';
import test from 'node:test';

test('sandbox outbound frame bounds reject deep values without recursive serialization', async () => {
  const moduleUrl = new URL(
    '../../apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-frame-bounds.mjs',
    import.meta.url
  );
  const { isSandboxFrameWithinBounds } = await import(moduleUrl.href);
  let value = 'leaf';
  for (let index = 0; index < 50_000; index += 1) value = { nested: value };

  assert.equal(isSandboxFrameWithinBounds(value), false);
});
