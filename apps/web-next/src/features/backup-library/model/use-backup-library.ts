import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveDownloadArtifact } from '../../../shared/api';
import { useI18n } from '../../../shared/i18n';
import { useMaintenanceOperation } from '../../../shared/maintenance';
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
  const maintenance = useMaintenanceOperation();
  return useMutation({
    mutationFn: (input: RestoreBackupInput) =>
      maintenance.runMaintenance(
        t('backup.restoring'),
        async () => {
          const result = await restoreLibraryBackup(input);
          if (result.settings) applyBackupSettings(result.settings);
          return result;
        },
        { reloadOnSuccess: true }
      ),
    onSuccess: async () => {
      await client.invalidateQueries();
      toast({ kind: 'success', title: t('backup.restored') });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('backup.restoreFailed'), description: errorMessage(error) })
  });
}

export type { CreateBackupInput, RestoreBackupInput };
