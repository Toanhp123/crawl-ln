import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../../shared/i18n';
import { saveDownloadArtifact } from '../../../shared/api';
import { toast } from '../../../shared/ui';
import {
  createLibraryBackup,
  restoreLibraryBackup,
  type CreateBackupInput,
  type RestoreBackupInput
} from '../api/backup-library';
import { applyBackupSettings } from '../lib/settings';

export function useCreateLibraryBackup() {
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: createLibraryBackup,
    onSuccess: (artifact) => {
      saveDownloadArtifact(artifact);
      toast({ kind: 'success', title: t('backup.created'), description: artifact.filename });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('backup.failed'), description: errorMessage(error) })
  });
}

export function useRestoreLibraryBackup() {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: restoreLibraryBackup,
    onSuccess: async (result) => {
      if (result.settings) applyBackupSettings(result.settings);
      await client.invalidateQueries();
      toast({ kind: 'success', title: t('backup.restored') });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('backup.restoreFailed'), description: errorMessage(error) })
  });
}

export type { CreateBackupInput, RestoreBackupInput };
