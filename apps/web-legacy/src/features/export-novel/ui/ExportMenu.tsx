import { BookOpen, Download, FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BottomSheet, Button, Field, Input, toast, useAsyncAction } from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { downloadBlob, exportNovelFile, type ExportNovelOptions } from '../api/exportNovel';

export function ExportMenu({ novelId }: { novelId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<'epub' | 'txt'>('epub');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [downloadedOnly, setDownloadedOnly] = useState(true);
  const exportAction = useAsyncAction();
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  const busy = exportAction.state === 'pending';

  useEffect(() => () => controllerRef.current?.abort(), []);

  const submit = async () => {
    setError('');
    try {
      await exportAction.run(async () => {
        const options: ExportNovelOptions = {
          format,
          downloadedOnly,
          range:
            from || to
              ? { from: from ? Number(from) : undefined, to: to ? Number(to) : undefined }
              : undefined
        };
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        const file = await exportNovelFile(novelId, options, controller.signal);
        downloadBlob(file.blob, file.filename);
        toast({ kind: 'success', title: t('export.ready'), description: file.filename });
        setOpen(false);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.error'));
    } finally {
      controllerRef.current = null;
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        className="w-full"
        leadingIcon={<Download size={16} />}
        onClick={() => setOpen(true)}
      >
        {t('export.action')}
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={(next) => {
          if (!next) controllerRef.current?.abort();
          setOpen(next);
        }}
        title={t('export.title')}
        description={t('export.description')}
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: 'epub', label: 'EPUB', icon: BookOpen },
                { value: 'txt', label: 'TXT', icon: FileText }
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={format === value ? 'primary' : 'secondary'}
                leadingIcon={<Icon size={16} />}
                disabled={busy}
                onClick={() => setFormat(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('export.fromChapter')}>
              <Input type="number" min="0" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label={t('export.toChapter')}>
              <Input type="number" min="0" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border p-3">
            <input
              type="checkbox"
              checked={downloadedOnly}
              disabled={busy}
              onChange={(e) => setDownloadedOnly(e.target.checked)}
            />
            <span>{t('export.downloadedOnly')}</span>
          </label>
          {error ? <p className="type-body-sm text-danger">{error}</p> : null}
          <Button
            actionState={exportAction.state}
            feedbackPolicy="longRunning"
            leadingIcon={<Download size={16} />}
            onClick={submit}
          >
            {t('export.action')}
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
