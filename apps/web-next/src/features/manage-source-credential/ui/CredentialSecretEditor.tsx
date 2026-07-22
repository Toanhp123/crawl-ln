import type { CredentialSecretFields, CredentialStrategy } from '../model/credential-secret';
import { useI18n } from '../../../shared/i18n';
import { Field, InlineNotice, Input } from '../../../shared/ui';

export function CredentialSecretEditor({
  strategy,
  value,
  onChange
}: {
  strategy: CredentialStrategy;
  value: CredentialSecretFields;
  onChange: (value: CredentialSecretFields) => void;
}) {
  const { t } = useI18n();
  const field = (key: keyof CredentialSecretFields, label: string, type = 'text') => (
    <Field label={label}>
      <Input
        type={type}
        value={value[key]}
        autoComplete="off"
        onChange={(event) => onChange({ ...value, [key]: event.target.value })}
      />
    </Field>
  );
  return (
    <div className="space-y-3">
      <InlineNotice>{t('manageSourceCredential.writeOnly')}</InlineNotice>
      {strategy === 'cookie-import'
        ? field('cookie', t('manageSourceCredential.cookie'), 'password')
        : null}
      {strategy === 'bearer-token'
        ? field('token', t('manageSourceCredential.token'), 'password')
        : null}
      {strategy === 'basic-auth' || strategy === 'form-login' ? (
        <>
          {field('username', t('manageSourceCredential.username'))}
          {field('password', t('manageSourceCredential.password'), 'password')}
        </>
      ) : null}
      {strategy === 'form-login'
        ? field('loginUrl', t('manageSourceCredential.loginUrl'), 'url')
        : null}
      {strategy === 'custom' ? (
        <>
          {field('customKey', t('manageSourceCredential.customKey'))}
          {field('customValue', t('manageSourceCredential.customValue'), 'password')}
        </>
      ) : null}
    </div>
  );
}
