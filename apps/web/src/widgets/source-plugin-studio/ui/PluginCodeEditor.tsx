import { useEffect, useRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useI18n } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/theme';
import { sourcePluginCodeEditorAriaLabel } from '../model/source-plugin-code-editor-accessibility';
import { sourcePluginStudioClipboardService } from '../model/source-plugin-studio-clipboard';
import { configureSourcePluginStudioMonaco } from '../model/configure-source-plugin-studio-monaco';
import { sourcePluginStudioModelUri } from '../model/use-source-plugin-studio-diagnostics';
import './source-plugin-studio-monaco-environment';

let configured = false;

function languageFor(path: string): string {
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'markdown';
  return 'typescript';
}

export function PluginCodeEditor({
  projectId,
  path,
  value,
  onChange,
  revealLocation
}: {
  projectId: string;
  path: string;
  value: string;
  onChange: (value: string) => void;
  revealLocation?: { line: number; column: number; token: number };
}) {
  const { t } = useI18n();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const { resolvedTheme } = useAppTheme();
  useEffect(() => {
    if (!revealLocation || !editorRef.current) return;
    const position = { lineNumber: revealLocation.line, column: revealLocation.column };
    editorRef.current.setPosition(position);
    editorRef.current.revealPositionInCenter(position);
    editorRef.current.focus();
  }, [revealLocation]);

  if (!configured) {
    loader.config({ monaco });
    configureSourcePluginStudioMonaco(monaco);
    configured = true;
  }
  return (
    <div className="h-full min-h-0 bg-surface">
      <Editor
        height="100%"
        path={sourcePluginStudioModelUri(projectId, path).toString()}
        language={languageFor(path)}
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
        value={value}
        onMount={(editor) => {
          editorRef.current = editor;
        }}
        onChange={(nextValue) => onChange(nextValue ?? '')}
        overrideServices={{ clipboardService: sourcePluginStudioClipboardService }}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineHeight: 22,
          padding: { top: 16 },
          automaticLayout: true,
          scrollBeyondLastLine: false,
          tabSize: 2,
          ariaLabel: sourcePluginCodeEditorAriaLabel(path, t)
        }}
      />
    </div>
  );
}
