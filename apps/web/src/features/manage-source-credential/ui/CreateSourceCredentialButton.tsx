import type { SourceReaderCredentialStrategy } from '@novel-tool/shared';
import { KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSourceCredential } from '@/entities/source-credential';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Button, Drawer, Field, FilterChip, Input, SegmentedControl, toast } from '@/shared/ui';
import {
  buildCredentialCreateRequest,
  canSubmitCredentialForm,
  createEmptyCredentialForm
} from '../model/credentialForm';
import { createEmptyCredentialSecrets } from '../model/credentialSecret';
import { CredentialSecretEditor } from './CredentialSecretEditor';

const strategies: SourceReaderCredentialStrategy[] = [
  'cookie-import',
  'bearer-token',
  'basic-auth',
  'form-login',
  'custom'
];

export function CreateSourceCredentialButton() {
  const { t, status, errorMessage } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(createEmptyCredentialForm);
  const reset = () => setForm(createEmptyCredentialForm());
  const create = useMutation({
    mutationFn: () => createSourceCredential(buildCredentialCreateRequest(form)),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.credentials.created') });
      setOpen(false);
      reset();
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.credentials() });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('sources.credentials.createFailed'),
        description: errorMessage(error)
      }),
    onSettled: () => setForm((current) => ({ ...current, secrets: createEmptyCredentialSecrets() }))
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
          if (!next) reset();
        }}
        title={t('sources.credentials.createTitle')}
      >
        <div className="space-y-4">
          <Field label={t('sources.credentials.name')}>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label={t('sources.credentials.owner')}>
            <SegmentedControl
              value={form.ownerType}
              columns={2}
              items={[
                { id: 'user', label: t('sources.common.user') },
                { id: 'system', label: t('sources.common.system') }
              ]}
              onChange={(ownerType) => setForm({ ...form, ownerType })}
            />
          </Field>
          <Field label={t('sources.credentials.strategy')}>
            <div className="flex flex-wrap gap-2">
              {strategies.map((strategy) => (
                <FilterChip
                  key={strategy}
                  selected={form.strategy === strategy}
                  onClick={() =>
                    setForm({ ...form, strategy, secrets: createEmptyCredentialSecrets() })
                  }
                >
                  {status(strategy)}
                </FilterChip>
              ))}
            </div>
          </Field>
          <Field label={t('sources.credentials.pluginId')} hint={t('sources.common.optional')}>
            <Input
              value={form.pluginId}
              onChange={(event) => setForm({ ...form, pluginId: event.target.value })}
            />
          </Field>
          <Field label={t('sources.credentials.domain')} hint={t('sources.common.optional')}>
            <Input
              value={form.domain}
              onChange={(event) => setForm({ ...form, domain: event.target.value })}
            />
          </Field>
          <CredentialSecretEditor
            strategy={form.strategy}
            value={form.secrets}
            onChange={(secrets) => setForm({ ...form, secrets })}
          />
          <Button
            full
            actionState={create.status}
            disabled={!canSubmitCredentialForm(form)}
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
