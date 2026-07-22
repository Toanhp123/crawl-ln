import {
  buildCredentialSecret,
  clearCredentialSecrets,
  hasCredentialSecret,
  type CredentialSecretFields,
  type CredentialStrategy
} from './credential-secret';

export type CredentialOwnerType = 'system' | 'user';
export interface CredentialCreateFormState {
  ownerType: CredentialOwnerType;
  strategy: CredentialStrategy;
  name: string;
  pluginId: string;
  domain: string;
  secrets: CredentialSecretFields;
}
export interface CredentialCreateInput {
  ownerType: CredentialOwnerType;
  pluginId?: string;
  domain?: string;
  name: string;
  strategy: CredentialStrategy;
  secret: Record<string, unknown>;
}

export function createEmptyCredentialForm(): CredentialCreateFormState {
  return {
    ownerType: 'user',
    strategy: 'cookie-import',
    name: '',
    pluginId: '',
    domain: '',
    secrets: clearCredentialSecrets()
  };
}
export function canSubmitCredentialForm(form: CredentialCreateFormState) {
  return Boolean(form.name.trim() && hasCredentialSecret(form.strategy, form.secrets));
}
export function buildCredentialCreateInput(form: CredentialCreateFormState): CredentialCreateInput {
  return {
    ownerType: form.ownerType,
    name: form.name.trim(),
    strategy: form.strategy,
    secret: buildCredentialSecret(form.strategy, form.secrets),
    ...(form.pluginId.trim() ? { pluginId: form.pluginId.trim() } : {}),
    ...(form.domain.trim() ? { domain: form.domain.trim() } : {})
  };
}
