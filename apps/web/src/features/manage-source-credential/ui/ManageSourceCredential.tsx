import type {
  SourceReaderCredentialMetadata,
  SourceReaderCredentialStrategy,
  SourceReaderOwnerType
} from '@novel-tool/shared';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createSourceCredential,
  deleteSourceCredential,
  updateSourceCredentialSecret
} from '@/entities/source-credential';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import {
  buildCredentialSecret,
  createEmptyCredentialSecrets,
  hasCredentialSecret,
  type CredentialSecretFields
} from '../model/credentialSecret';
import {
  Button,
  ConfirmDialog,
  Drawer,
  Field,
  FilterChip,
  InlineNotice,
  Input,
  SegmentedControl,
  toast
} from '@/shared/ui';

const strategies: SourceReaderCredentialStrategy[] = [
  'cookie-import',
  'bearer-token',
  'basic-auth',
  'form-login',
  'custom'
];

function SecretEditor({
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

export function CreateSourceCredentialButton() {
  const { t, status, errorMessage } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ownerType, setOwnerType] = useState<SourceReaderOwnerType>('user');
  const [strategy, setStrategy] = useState<SourceReaderCredentialStrategy>('cookie-import');
  const [name, setName] = useState('');
  const [pluginId, setPluginId] = useState('');
  const [domain, setDomain] = useState('');
  const [secrets, setSecrets] = useState(createEmptyCredentialSecrets);
  const create = useMutation({
    mutationFn: () =>
      createSourceCredential({
        ownerType,
        name: name.trim(),
        strategy,
        secret: buildCredentialSecret(strategy, secrets),
        ...(pluginId.trim() ? { pluginId: pluginId.trim() } : {}),
        ...(domain.trim() ? { domain: domain.trim() } : {})
      }),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.credentials.created') });
      setOpen(false);
      setName('');
      setPluginId('');
      setDomain('');
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.credentials() });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('sources.credentials.createFailed'),
        description: errorMessage(error)
      }),
    onSettled: () => setSecrets(createEmptyCredentialSecrets())
  });
  return (
    <>
      <Button leadingIcon={<Plus size={17} />} onClick={() => setOpen(true)}>
        {t('sources.credentials.create')}
      </Button>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSecrets(createEmptyCredentialSecrets());
        }}
        title={t('sources.credentials.createTitle')}
      >
        <div className="space-y-4">
          <Field label={t('sources.credentials.name')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('sources.credentials.owner')}>
            <SegmentedControl
              value={ownerType}
              columns={2}
              items={[
                { id: 'user', label: t('sources.common.user') },
                { id: 'system', label: t('sources.common.system') }
              ]}
              onChange={setOwnerType}
            />
          </Field>
          <Field label={t('sources.credentials.strategy')}>
            <div className="flex flex-wrap gap-2">
              {strategies.map((item) => (
                <FilterChip
                  key={item}
                  selected={strategy === item}
                  onClick={() => {
                    setStrategy(item);
                    setSecrets(createEmptyCredentialSecrets());
                  }}
                >
                  {status(item)}
                </FilterChip>
              ))}
            </div>
          </Field>
          <Field label={t('sources.credentials.pluginId')} hint={t('sources.common.optional')}>
            <Input value={pluginId} onChange={(e) => setPluginId(e.target.value)} />
          </Field>
          <Field label={t('sources.credentials.domain')} hint={t('sources.common.optional')}>
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} />
          </Field>
          <SecretEditor strategy={strategy} value={secrets} onChange={setSecrets} />
          <Button
            full
            actionState={create.status}
            disabled={!name.trim() || !hasCredentialSecret(strategy, secrets)}
            leadingIcon={<KeyRound size={17} />}
            onClick={() => create.mutate()}
          >
            {t('sources.common.create')}
          </Button>
        </div>
      </Drawer>
    </>
  );
}

export function ReplaceSourceCredentialSecretButton({
  credential
}: {
  credential: SourceReaderCredentialMetadata;
}) {
  const { t, errorMessage } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [secrets, setSecrets] = useState(createEmptyCredentialSecrets);
  const update = useMutation({
    mutationFn: () =>
      updateSourceCredentialSecret(credential.id, {
        secret: buildCredentialSecret(credential.strategy, secrets)
      }),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.credentials.updated') });
      setOpen(false);
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.credentials() });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('sources.credentials.updateFailed'),
        description: errorMessage(error)
      }),
    onSettled: () => setSecrets(createEmptyCredentialSecrets())
  });
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={<Pencil size={16} />}
        onClick={() => setOpen(true)}
      >
        {t('sources.credentials.replace')}
      </Button>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSecrets(createEmptyCredentialSecrets());
        }}
        title={t('sources.credentials.replaceTitle')}
      >
        <div className="space-y-4">
          <SecretEditor strategy={credential.strategy} value={secrets} onChange={setSecrets} />
          <Button
            full
            actionState={update.status}
            disabled={!hasCredentialSecret(credential.strategy, secrets)}
            onClick={() => update.mutate()}
          >
            {t('sources.common.save')}
          </Button>
        </div>
      </Drawer>
    </>
  );
}

export function DeleteSourceCredentialButton({ credentialId }: { credentialId: string }) {
  const { t, errorMessage } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteSourceCredential(credentialId),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.credentials.deleted') });
      setOpen(false);
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.credentials() });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('sources.updateFailed'), description: errorMessage(error) })
  });
  return (
    <>
      <Button
        size="sm"
        variant="danger"
        leadingIcon={<Trash2 size={16} />}
        onClick={() => setOpen(true)}
      >
        {t('sources.plugins.remove')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('sources.credentials.deleteTitle')}
        description={t('sources.credentials.deleteDescription')}
        danger
        actionState={remove.status}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
