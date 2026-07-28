import type {
  SourcePluginArchivePreview,
  SourcePluginProjectImportResolution
} from '@novel-tool/shared';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  inspectSourcePluginArchive,
  MAX_SOURCE_PLUGIN_ARCHIVE_BYTES
} from '../../../entities/source-plugin-archive';
import {
  sourcePluginProjectInvalidation,
  type SourcePluginProject
} from '../../../entities/source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import {
  importSourcePluginProject,
  type ImportSourcePluginProjectInput
} from '../api/import-source-plugin-project';

export type SourcePluginProjectImportStep = 'choose' | 'preview' | 'importing';

export function invalidateImportedSourcePluginProject(client: QueryClient) {
  return sourcePluginProjectInvalidation.invalidateAll(client);
}

export function useImportSourcePluginProject(onImported: (project: SourcePluginProject) => void) {
  const client = useQueryClient();
  const { errorMessage, t } = useI18n();
  const selectedFile = useRef<File>();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<SourcePluginArchivePreview>();
  const [resolution, setResolution] = useState<SourcePluginProjectImportResolution>();
  const [error, setError] = useState<string>();
  const [step, setStep] = useState<SourcePluginProjectImportStep>('choose');

  const inspection = useMutation({
    mutationFn: inspectSourcePluginArchive,
    onSuccess(nextPreview, inspectedFile) {
      if (selectedFile.current !== inspectedFile) return;
      setPreview(nextPreview);
      setResolution(nextPreview.conflicts.length === 0 ? { type: 'create-copy' } : undefined);
      setError(undefined);
      setStep('preview');
    },
    onError(inspectError, inspectedFile) {
      if (selectedFile.current !== inspectedFile) return;
      setPreview(undefined);
      setResolution(undefined);
      setError(errorMessage(inspectError));
      setStep('choose');
    }
  });

  const importProject = useMutation({
    mutationFn: (input: ImportSourcePluginProjectInput) => importSourcePluginProject(input),
    async onSuccess(project) {
      await invalidateImportedSourcePluginProject(client);
      toast({ kind: 'success', title: t('importSourcePluginProject.imported') });
      onImported(project);
    },
    onError(importError) {
      setError(errorMessage(importError));
      setStep('preview');
      toast({
        kind: 'error',
        title: t('importSourcePluginProject.failed'),
        description: errorMessage(importError)
      });
    }
  });

  function reset() {
    selectedFile.current = undefined;
    inspection.reset();
    importProject.reset();
    setFile(undefined);
    setPreview(undefined);
    setResolution(undefined);
    setError(undefined);
    setStep('choose');
  }

  function chooseFile(nextFile: File | undefined) {
    reset();
    if (!nextFile) return;
    selectedFile.current = nextFile;
    setFile(nextFile);
    if (nextFile.size > MAX_SOURCE_PLUGIN_ARCHIVE_BYTES) {
      setError(t('importSourcePluginProject.tooLarge'));
      return;
    }
    inspection.mutate(nextFile);
  }

  function selectResolution(id: string) {
    if (id === 'create-copy') {
      setResolution({ type: 'create-copy' });
      return;
    }
    const projectId = id.startsWith('update:') ? id.slice('update:'.length) : '';
    const conflict = preview?.conflicts.find((candidate) => candidate.id === projectId);
    setResolution(
      conflict
        ? {
            type: 'update',
            projectId: conflict.id,
            expectedRevision: conflict.revision
          }
        : undefined
    );
  }

  function confirmImport() {
    if (!file || !preview || !resolution || preview.kind === 'built-package') return;
    setError(undefined);
    setStep('importing');
    importProject.mutate({ file, expectedChecksum: preview.checksum, resolution });
  }

  return {
    file,
    preview,
    resolution,
    resolutionId:
      resolution?.type === 'update' ? `update:${resolution.projectId}` : resolution?.type,
    error,
    step,
    inspectionPending: inspection.isPending,
    importActionState: importProject.status,
    canImport: Boolean(preview && preview.kind !== 'built-package' && resolution),
    chooseFile,
    selectResolution,
    confirmImport,
    reset
  };
}
