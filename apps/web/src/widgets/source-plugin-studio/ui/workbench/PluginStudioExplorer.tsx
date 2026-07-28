import {
  AlertTriangle,
  Copy,
  FilePlus2,
  FolderPlus,
  Lock,
  Pencil,
  Trash2,
  CircleX
} from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../../shared/i18n';
import { cn } from '../../../../shared/lib/cn';
import { IconButton, Text } from '../../../../shared/ui';
import type { SourcePluginStudioDiagnosticsByPath } from '../../model/source-plugin-studio-diagnostics';

export function PluginStudioExplorer({
  files,
  selectedFile,
  disabled,
  diagnosticsByPath = {},
  onSelect,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDuplicate,
  onDelete
}: {
  files: string[];
  selectedFile: string;
  disabled?: boolean;
  diagnosticsByPath?: SourcePluginStudioDiagnosticsByPath;
  onSelect: (path: string) => void;
  onCreateFile: (path: string) => void;
  onCreateFolder: (path: string) => void;
  onRename: (currentPath: string, nextPath: string) => void;
  onDuplicate: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string>();

  const run = (operation: () => void) => {
    try {
      operation();
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const promptFor = (message: string, initialValue = '') =>
    window.prompt(message, initialValue)?.trim();

  const createFile = () => {
    const path = promptFor(t('pluginStudio.filePathPrompt'), 'src/new-file.ts');
    if (path) run(() => onCreateFile(path));
  };

  const createFolder = () => {
    const folder = promptFor(t('pluginStudio.folderPathPrompt'), 'src/new-folder');
    if (folder) run(() => onCreateFolder(`${folder.replace(/\/+$/, '')}/index.ts`));
  };

  const rename = () => {
    if (!selectedFile || selectedFile === 'manifest.json') return;
    const path = promptFor(t('pluginStudio.renameFilePrompt'), selectedFile);
    if (path) run(() => onRename(selectedFile, path));
  };

  const remove = () => {
    if (!selectedFile || selectedFile === 'manifest.json') return;
    if (!window.confirm(t('pluginStudio.deleteFileConfirm', { path: selectedFile }))) return;
    run(() => onDelete(selectedFile));
  };

  const protectedSelection = !selectedFile || selectedFile === 'manifest.json';

  return (
    <aside
      className="flex h-full min-h-0 min-w-0 flex-col"
      aria-label={t('pluginStudio.projectSummary')}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-col items-center justify-between gap-2 border-b border-border px-3 py-2">
          <Text as="h2" variant="titleSm">
            {t('pluginStudio.fileExplorer')}
          </Text>
          <div className="flex items-center gap-0.5">
            <IconButton
              variant="ghost"
              aria-label={t('pluginStudio.newFile')}
              title={t('pluginStudio.newFile')}
              disabled={disabled}
              onClick={createFile}
            >
              <FilePlus2 size={16} />
            </IconButton>
            <IconButton
              variant="ghost"
              aria-label={t('pluginStudio.newFolder')}
              title={t('pluginStudio.newFolder')}
              disabled={disabled}
              onClick={createFolder}
            >
              <FolderPlus size={16} />
            </IconButton>
            <IconButton
              variant="ghost"
              aria-label={t('pluginStudio.renameFile')}
              title={t('pluginStudio.renameFile')}
              disabled={disabled || protectedSelection}
              onClick={rename}
            >
              <Pencil size={16} />
            </IconButton>
            <IconButton
              variant="ghost"
              aria-label={t('pluginStudio.duplicateFile')}
              title={t('pluginStudio.duplicateFile')}
              disabled={disabled || protectedSelection}
              onClick={() => run(() => onDuplicate(selectedFile))}
            >
              <Copy size={16} />
            </IconButton>
            <IconButton
              variant="ghost"
              aria-label={t('pluginStudio.deleteFile')}
              title={t('pluginStudio.deleteFile')}
              disabled={disabled || protectedSelection}
              onClick={remove}
            >
              <Trash2 size={16} />
            </IconButton>
          </div>
        </div>

        <nav
          aria-label={t('pluginStudio.projectFiles')}
          className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2"
        >
          {files.map((file) => {
            const diagnostic = diagnosticsByPath[file];
            const protectedFile = file === 'manifest.json';
            return (
              <button
                key={file}
                type="button"
                aria-current={selectedFile === file ? 'page' : undefined}
                onClick={() => onSelect(file)}
                className={cn(
                  'flex w-full min-w-0 items-center gap-2 rounded-[var(--radius-md)] border border-transparent px-2 py-1.5 text-left font-mono text-xs text-secondary transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                  selectedFile === file &&
                    'border-primary-state-border bg-primary-selected text-primary'
                )}
              >
                {protectedFile ? (
                  <Lock size={14} className="shrink-0" aria-label={t('pluginStudio.lockedFile')} />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate" title={file}>
                  {file}
                </span>
                {diagnostic?.errors ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5 text-danger"
                    aria-label={t('pluginStudio.fileErrorCount', { count: diagnostic.errors })}
                  >
                    <CircleX size={12} aria-hidden="true" />
                    {diagnostic.errors}
                  </span>
                ) : null}
                {diagnostic?.warnings ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5 text-warning"
                    aria-label={t('pluginStudio.fileWarningCount', { count: diagnostic.warnings })}
                  >
                    <AlertTriangle size={12} aria-hidden="true" />
                    {diagnostic.warnings}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {error ? (
          <Text
            variant="caption"
            tone="danger"
            className="border-t border-border px-3 py-2"
            role="alert"
          >
            {error}
          </Text>
        ) : null}
      </div>
    </aside>
  );
}
