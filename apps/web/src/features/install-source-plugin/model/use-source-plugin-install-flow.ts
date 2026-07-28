import type {
  SourcePluginArchivePreview,
  SourceReaderPluginInstallResult
} from '@novel-tool/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  inspectSourcePluginArchive,
  MAX_SOURCE_PLUGIN_ARCHIVE_BYTES
} from '../../../entities/source-plugin-archive';
import { sourcePluginInvalidation } from '../../../entities/source-plugin';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { installSourcePluginArchive } from '../api/install-source-plugin';

export type SourcePluginInstallStep = 'choose' | 'preview' | 'installing' | 'result';

export function useSourcePluginInstallFlow(onInstalled?: () => void) {
  const client = useQueryClient();
  const { errorMessage, t } = useI18n();
  const selectedFile = useRef<File>();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<SourcePluginArchivePreview>();
  const [result, setResult] = useState<SourceReaderPluginInstallResult>();
  const [error, setError] = useState<string>();
  const [step, setStep] = useState<SourcePluginInstallStep>('choose');

  const inspection = useMutation({
    mutationFn: inspectSourcePluginArchive,
    onSuccess(nextPreview, inspectedFile) {
      if (selectedFile.current !== inspectedFile) return;
      setPreview(nextPreview);
      setError(undefined);
      setStep('preview');
    },
    onError(inspectError, inspectedFile) {
      if (selectedFile.current !== inspectedFile) return;
      setPreview(undefined);
      setError(errorMessage(inspectError));
      setStep('choose');
    }
  });

  const installation = useMutation({
    mutationFn: ({ archive, checksum }: { archive: File; checksum: string }) =>
      installSourcePluginArchive(archive, checksum),
    async onSuccess(nextResult) {
      await sourcePluginInvalidation.invalidateAll(client);
      selectedFile.current = undefined;
      setFile(undefined);
      setPreview(undefined);
      setError(undefined);
      setResult(nextResult);
      setStep('result');
      toast({ kind: 'success', title: t('installSourcePlugin.installed') });
      onInstalled?.();
    },
    onError(installError) {
      setError(errorMessage(installError));
      setStep('preview');
      toast({
        kind: 'error',
        title: t('installSourcePlugin.failed'),
        description: errorMessage(installError)
      });
    }
  });

  function reset() {
    selectedFile.current = undefined;
    inspection.reset();
    installation.reset();
    setFile(undefined);
    setPreview(undefined);
    setResult(undefined);
    setError(undefined);
    setStep('choose');
  }

  function chooseFile(nextFile: File | undefined) {
    reset();
    if (!nextFile) return;
    selectedFile.current = nextFile;
    setFile(nextFile);
    if (nextFile.size > MAX_SOURCE_PLUGIN_ARCHIVE_BYTES) {
      setError(t('installSourcePlugin.tooLarge'));
      return;
    }
    inspection.mutate(nextFile);
  }

  function confirmInstall() {
    if (!file || !preview || installation.isPending) return;
    setError(undefined);
    setStep('installing');
    installation.mutate({ archive: file, checksum: preview.checksum });
  }

  return {
    file,
    preview,
    result,
    error,
    step,
    inspectionPending: inspection.isPending,
    installActionState: installation.status,
    chooseFile,
    confirmInstall,
    reset
  };
}
