import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useI18n } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/theme';
import { sourcePluginCodeEditorAriaLabel } from '../model/source-plugin-code-editor-accessibility';
import './source-plugin-studio-monaco-environment';

let configured = false;

function languageFor(path: string): string {
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'markdown';
  return 'typescript';
}

export function PluginCodeEditor({
  path,
  value,
  onChange
}: {
  path: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const { resolvedTheme } = useAppTheme();
  if (!configured) {
    loader.config({ monaco });
    configured = true;
  }
  return (
    <div className="min-h-0 bg-surface">
      <Editor
        height="100%"
        path={path}
        language={languageFor(path)}
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
        value={value}
        onChange={(nextValue) => onChange(nextValue ?? '')}
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
