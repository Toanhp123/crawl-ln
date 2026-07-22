import { useMutation } from '@tanstack/react-query';
import { useI18n } from '../../../shared/i18n';
import { saveDownloadArtifact } from '../../../shared/api';
import { toast } from '../../../shared/ui';
import { exportNovel, type ExportNovelInput } from '../api/export-novel';

export function useExportNovel() {
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: exportNovel,
    onSuccess: (artifact) => {
      saveDownloadArtifact(artifact);
      toast({ kind: 'success', title: t('export.ready'), description: artifact.filename });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('export.failed'),
        description: errorMessage(error, 'common.requestFailed')
      })
  });
}

export type { ExportNovelInput };
