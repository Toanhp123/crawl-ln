import type { ExportFormat } from '@novel-tool/shared';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Button, SegmentedControl, Stack, Switch } from '../../../shared/ui';
import { useExportNovel } from '../model/use-export-novel';

export function ExportNovelControl({ novelId }: { novelId: string }) {
  const [format, setFormat] = useState<ExportFormat>('epub');
  const [downloadedOnly, setDownloadedOnly] = useState(true);
  const mutation = useExportNovel();
  const { t } = useI18n();
  return (
    <Stack gap="sm">
      <SegmentedControl
        value={format}
        columns={2}
        disabled={mutation.isPending}
        ariaLabel={t('export.format')}
        items={[
          { id: 'epub', label: 'EPUB' },
          { id: 'txt', label: 'TXT' }
        ]}
        onChange={setFormat}
      />
      <Switch
        checked={downloadedOnly}
        disabled={mutation.isPending}
        label={t('export.downloadedOnly')}
        onCheckedChange={setDownloadedOnly}
      />
      <Button
        full
        actionState={mutation.status}
        feedbackPolicy="longRunning"
        leadingIcon={<Download size={16} />}
        onClick={() => mutation.mutate({ novelId, format, downloadedOnly })}
      >
        {t('export.action')}
      </Button>
    </Stack>
  );
}
