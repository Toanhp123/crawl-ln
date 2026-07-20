import type { SourceReaderCredentialStrategy } from '@novel-tool/shared';
import type { CredentialSecretFields } from '../model/credentialSecret';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Field, InlineNotice, Input } from '@/shared/ui';

export function CredentialSecretEditor({
  strategy,
  value,
  onChange
}: {
  strategy: SourceReaderCredentialStrategy;
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
      <InlineNotice>{t('sources.credentials.secretWriteOnly')}</InlineNotice>
      {strategy === 'cookie-import'
        ? field('cookie', t('sources.credentials.cookie'), 'password')
        : null}
      {strategy === 'bearer-token'
        ? field('token', t('sources.credentials.token'), 'password')
        : null}
      {strategy === 'basic-auth' || strategy === 'form-login' ? (
        <>
          {field('username', t('sources.credentials.username'))}
          {field('password', t('sources.credentials.password'), 'password')}
        </>
      ) : null}
      {strategy === 'form-login'
        ? field('loginUrl', t('sources.credentials.loginUrl'), 'url')
        : null}
      {strategy === 'custom' ? (
        <>
          {field('customKey', t('sources.credentials.customKey'))}
          {field('customValue', t('sources.credentials.customValue'), 'password')}
        </>
      ) : null}
    </div>
  );
}
