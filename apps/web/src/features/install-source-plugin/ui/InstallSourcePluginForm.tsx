import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Button, ErrorBanner, Field, InlineNotice, Input, Panel } from '../../../shared/ui';
import { MAX_SOURCE_PLUGIN_BYTES } from '../api/install-source-plugin';
import { useInstallSourcePlugin } from '../model/use-install-source-plugin';

export function InstallSourcePluginForm({ onInstalled }: { onInstalled?: () => void }) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const install = useInstallSourcePlugin(() => {
    setFile(undefined);
    if (inputRef.current) inputRef.current.value = '';
    onInstalled?.();
  });
  const tooLarge = Boolean(file && file.size > MAX_SOURCE_PLUGIN_BYTES);

  return (
    <Panel tone="default" padding="lg" className="space-y-4">
      <InlineNotice>{t('installSourcePlugin.description')}</InlineNotice>
      <Field label={t('installSourcePlugin.file')}>
        <Input
          ref={inputRef}
          type="file"
          accept=".zip,.source-plugin,application/zip"
          onChange={(event) => setFile(event.target.files?.[0])}
        />
      </Field>
      {file ? <InlineNotice>{file.name}</InlineNotice> : null}
      {tooLarge ? <ErrorBanner error={t('installSourcePlugin.tooLarge')} /> : null}
      <Button
        leadingIcon={<Upload size={17} />}
        actionState={install.status}
        disabled={!file || tooLarge}
        onClick={() => file && install.mutate(file)}
      >
        {t('installSourcePlugin.install')}
      </Button>
    </Panel>
  );
}
