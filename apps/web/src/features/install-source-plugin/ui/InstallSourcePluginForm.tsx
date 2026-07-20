import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { installSourcePlugin } from '@/entities/source-plugin';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Button, ErrorBanner, Field, InlineNotice, Input, Panel, toast } from '@/shared/ui';
const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
export function InstallSourcePluginForm({ onInstalled }: { onInstalled?: () => void }) {
  const { t, errorMessage } = useI18n();
  const client = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [validation, setValidation] = useState<string>();
  const install = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t('sources.plugins.fileRequired'));
      if (file.size > MAX_PACKAGE_BYTES) throw new Error(t('sources.plugins.fileTooLarge'));
      return installSourcePlugin(file);
    },
    onSuccess: () => {
      setFile(undefined);
      setValidation(undefined);
      if (inputRef.current) inputRef.current.value = '';
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.plugins() });
      toast({ kind: 'success', title: t('sources.plugins.installed') });
      onInstalled?.();
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('sources.plugins.installFailed'),
        description: errorMessage(error)
      })
  });
  return (
    <Panel tone="default" padding="lg" className="space-y-4">
      <InlineNotice>{t('sources.plugins.installDescription')}</InlineNotice>
      <Field label={t('sources.plugins.file')} hint={t('sources.plugins.fileHint')}>
        <Input
          ref={inputRef}
          type="file"
          accept=".zip,.source-plugin,application/zip"
          onChange={(event) => {
            const next = event.target.files?.[0];
            setFile(next);
            setValidation(
              next && next.size > MAX_PACKAGE_BYTES ? t('sources.plugins.fileTooLarge') : undefined
            );
          }}
        />
      </Field>
      {file ? <InlineNotice>{file.name}</InlineNotice> : null}
      {validation ? <ErrorBanner error={validation} /> : null}
      <Button
        leadingIcon={<Upload size={17} />}
        actionState={install.status}
        disabled={!file || Boolean(validation)}
        onClick={() => install.mutate()}
      >
        {t('sources.plugins.install')}
      </Button>
    </Panel>
  );
}
