import { KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Button, Drawer, Field, FilterChip, Input, SegmentedControl } from '../../../shared/ui';
import {
  buildCredentialCreateInput,
  canSubmitCredentialForm,
  createEmptyCredentialForm
} from '../model/credential-form';
import { clearCredentialSecrets, type CredentialStrategy } from '../model/credential-secret';
import { useCreateSourceCredential } from '../model/use-source-credential-actions';
import { CredentialSecretEditor } from './CredentialSecretEditor';

const strategies: CredentialStrategy[] = [
  'cookie-import',
  'bearer-token',
  'basic-auth',
  'form-login',
  'custom'
];

export function CreateSourceCredentialButton() {
  const { t, status } = useI18n();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(createEmptyCredentialForm);
  const reset = () => setForm(createEmptyCredentialForm());
  const create = useCreateSourceCredential(
    () => {
      setOpen(false);
      reset();
    },
    () => setForm((current) => ({ ...current, secrets: clearCredentialSecrets() }))
  );
  return (
    <>
      <Button leadingIcon={<Plus size={17} />} onClick={() => setOpen(true)}>
        {t('manageSourceCredential.create')}
      </Button>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
        title={t('manageSourceCredential.createTitle')}
      >
        <div className="space-y-4">
          <Field label={t('manageSourceCredential.name')}>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <SegmentedControl
            value={form.ownerType}
            columns={2}
            items={[
              { id: 'user', label: t('manageSourceCredential.user') },
              { id: 'system', label: t('manageSourceCredential.system') }
            ]}
            onChange={(ownerType) => setForm({ ...form, ownerType })}
          />
          <div className="flex flex-wrap gap-2">
            {strategies.map((strategy) => (
              <FilterChip
                key={strategy}
                selected={form.strategy === strategy}
                onClick={() => setForm({ ...form, strategy, secrets: clearCredentialSecrets() })}
              >
                {status(strategy)}
              </FilterChip>
            ))}
          </div>
          <Field label={t('manageSourceCredential.plugin')}>
            <Input
              value={form.pluginId}
              onChange={(event) => setForm({ ...form, pluginId: event.target.value })}
            />
          </Field>
          <Field label={t('manageSourceCredential.domain')}>
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
            leadingIcon={<KeyRound size={17} />}
            actionState={create.status}
            disabled={!canSubmitCredentialForm(form)}
            onClick={() => create.mutate(buildCredentialCreateInput(form))}
          >
            {t('manageSourceCredential.save')}
          </Button>
        </div>
      </Drawer>
    </>
  );
}
