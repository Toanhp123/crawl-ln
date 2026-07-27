import { useEffect, useMemo, useState } from 'react';
import * as monaco from 'monaco-editor';
import { configureSourcePluginStudioMonaco } from './configure-source-plugin-studio-monaco';
import {
  summarizeSourcePluginStudioDiagnostics,
  type SourcePluginStudioDiagnostic
} from './source-plugin-studio-diagnostics';

const ROOT = 'file:///source-plugin-studio/projects/';

function supported(path: string) {
  return /\.[cm]?[jt]sx?$/.test(path);
}

export function sourcePluginStudioModelUri(projectId: string, path: string) {
  return monaco.Uri.parse(`${ROOT}${encodeURIComponent(projectId)}/${path}`);
}

function collect(projectId: string): SourcePluginStudioDiagnostic[] {
  const prefix = `${ROOT}${encodeURIComponent(projectId)}/`;
  const diagnostics: SourcePluginStudioDiagnostic[] = [];
  for (const marker of monaco.editor.getModelMarkers({})) {
    if (!marker.resource.toString().startsWith(prefix)) continue;
    if (
      marker.severity !== monaco.MarkerSeverity.Error &&
      marker.severity !== monaco.MarkerSeverity.Warning
    ) {
      continue;
    }
    diagnostics.push({
      path: decodeURIComponent(marker.resource.toString().slice(prefix.length)),
      severity: marker.severity === monaco.MarkerSeverity.Error ? 'error' : 'warning',
      message: marker.message,
      line: marker.startLineNumber,
      column: marker.startColumn
    });
  }
  return diagnostics.sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.line - right.line || left.column - right.column
  );
}

export function useSourcePluginStudioDiagnostics(projectId: string, files: Record<string, string>) {
  const [diagnostics, setDiagnostics] = useState<SourcePluginStudioDiagnostic[]>([]);

  useEffect(() => {
    configureSourcePluginStudioMonaco(monaco);
    const owned = new Set<string>();
    for (const [path, value] of Object.entries(files)) {
      if (!supported(path)) continue;
      const uri = sourcePluginStudioModelUri(projectId, path);
      owned.add(uri.toString());
      const existing = monaco.editor.getModel(uri);
      if (existing) {
        if (existing.getValue() !== value) existing.setValue(value);
      } else {
        monaco.editor.createModel(value, 'typescript', uri);
      }
    }

    const prefix = `${ROOT}${encodeURIComponent(projectId)}/`;
    for (const model of monaco.editor.getModels()) {
      const uri = model.uri.toString();
      if (uri.startsWith(prefix) && !owned.has(uri)) model.dispose();
    }

    const refresh = () => setDiagnostics(collect(projectId));
    refresh();
    const subscription = monaco.editor.onDidChangeMarkers(refresh);
    return () => subscription.dispose();
  }, [files, projectId]);

  const summary = useMemo(() => summarizeSourcePluginStudioDiagnostics(diagnostics), [diagnostics]);
  return { diagnostics, summary };
}
