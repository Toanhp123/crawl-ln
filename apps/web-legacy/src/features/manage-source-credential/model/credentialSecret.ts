import type { SourceReaderCredentialStrategy } from '@novel-tool/shared';

export type CredentialSecretFields = {
  cookie: string;
  token: string;
  username: string;
  password: string;
  loginUrl: string;
  customKey: string;
  customValue: string;
};

export const createEmptyCredentialSecrets = (): CredentialSecretFields => ({
  cookie: '',
  token: '',
  username: '',
  password: '',
  loginUrl: '',
  customKey: '',
  customValue: ''
});

export function hasCredentialSecret(
  strategy: SourceReaderCredentialStrategy,
  value: CredentialSecretFields
) {
  if (strategy === 'cookie-import') return Boolean(value.cookie.trim());
  if (strategy === 'bearer-token') return Boolean(value.token.trim());
  if (strategy === 'basic-auth' || strategy === 'form-login')
    return Boolean(value.username.trim() && value.password);
  return Boolean(value.customKey.trim() && value.customValue);
}

export function buildCredentialSecret(
  strategy: SourceReaderCredentialStrategy,
  value: CredentialSecretFields
): Record<string, unknown> {
  if (strategy === 'cookie-import') return { cookie: value.cookie.trim() };
  if (strategy === 'bearer-token') return { token: value.token.trim() };
  if (strategy === 'basic-auth')
    return { username: value.username.trim(), password: value.password };
  if (strategy === 'form-login')
    return {
      username: value.username.trim(),
      password: value.password,
      ...(value.loginUrl.trim() ? { loginUrl: value.loginUrl.trim() } : {})
    };
  return { [value.customKey.trim()]: value.customValue };
}
