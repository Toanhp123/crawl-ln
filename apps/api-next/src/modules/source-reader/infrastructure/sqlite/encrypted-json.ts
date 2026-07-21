import type {
  SealedSecret,
  SecretContext,
  SecretVault
} from '../../application/ports/secret-vault.port.js';

export async function sealJson(
  vault: SecretVault,
  value: Record<string, unknown>,
  context: SecretContext
): Promise<SealedSecret> {
  return vault.seal(Buffer.from(JSON.stringify(value), 'utf8'), context);
}

export async function unsealJson(
  vault: SecretVault,
  sealed: SealedSecret,
  context: SecretContext
): Promise<Record<string, unknown>> {
  const bytes = await vault.unseal(sealed, context);
  return JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, unknown>;
}
