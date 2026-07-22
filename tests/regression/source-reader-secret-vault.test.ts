import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalEncryptedVault } from '../../apps/api-legacy/src/modules/source-reader/infrastructure/secrets/local-encrypted.vault.ts';
import { SourceReaderError } from '../../apps/api-legacy/src/modules/source-reader/domain/errors/source-reader.error.ts';

const context = {
  recordType: 'credential',
  recordId: 'cred-1',
  ownerType: 'user',
  ownerId: 'user-1',
  pluginId: 'demo'
} as const;

test('vault round-trips bytes and binds ciphertext to record context', async () => {
  const vault = new LocalEncryptedVault(Buffer.alloc(32, 7));
  const sealed = await vault.seal(Buffer.from('secret'), context);
  assert.equal((await vault.unseal(sealed, context)).toString(), 'secret');
  await assert.rejects(() => vault.unseal(sealed, { ...context, recordId: 'cred-2' }));
});

test('unavailable vault returns stable degraded-mode error', async () => {
  const vault = new LocalEncryptedVault(undefined);
  await assert.rejects(
    () => vault.seal(Buffer.from('secret'), context),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'SECRET_VAULT_UNAVAILABLE'
  );
});
