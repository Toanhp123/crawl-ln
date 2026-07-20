import type {
  SourceReaderCredentialCreateRequest,
  SourceReaderCredentialStrategy,
  SourceReaderOwnerType
} from '@novel-tool/shared';
import {
  buildCredentialSecret,
  createEmptyCredentialSecrets,
  hasCredentialSecret,
  type CredentialSecretFields
} from './credentialSecret';

export type CredentialCreateFormState = {
  ownerType: SourceReaderOwnerType;
  strategy: SourceReaderCredentialStrategy;
  name: string;
  pluginId: string;
  domain: string;
  secrets: CredentialSecretFields;
};

export const createEmptyCredentialForm = (): CredentialCreateFormState => ({
  ownerType: 'user',
  strategy: 'cookie-import',
  name: '',
  pluginId: '',
  domain: '',
  secrets: createEmptyCredentialSecrets()
});

export const canSubmitCredentialForm = (form: CredentialCreateFormState) =>
  Boolean(form.name.trim() && hasCredentialSecret(form.strategy, form.secrets));

export function buildCredentialCreateRequest(
  form: CredentialCreateFormState
): SourceReaderCredentialCreateRequest {
  return {
    ownerType: form.ownerType,
    strategy: form.strategy,
    name: form.name.trim(),
    secret: buildCredentialSecret(form.strategy, form.secrets),
    ...(form.pluginId.trim() ? { pluginId: form.pluginId.trim() } : {}),
    ...(form.domain.trim() ? { domain: form.domain.trim() } : {})
  };
}
