import { useMutation } from '@tanstack/react-query';
import { saveDownloadArtifact } from '../../../shared/api';
import { exportSourcePluginProject } from '../api/export-source-plugin-project';

export function useExportSourcePluginProject() {
  return useMutation({
    mutationFn: exportSourcePluginProject,
    onSuccess: (artifact) => saveDownloadArtifact(artifact)
  });
}
