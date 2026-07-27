import { useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { cn } from '../../../shared/lib/cn';
import { Button, Text } from '../../../shared/ui';

export function PluginProjectFileTree({
  files,
  selectedFile,
  disabled,
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
    <aside className="min-w-0 border-b border-border bg-surface2 p-2 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between gap-2 px-2 py-2">
        <Text as="h3" variant="caption" tone="muted" className="font-bold uppercase">
          {t('pluginStudio.projectFiles')}
        </Text>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" disabled={disabled} onClick={createFile}>
            {t('pluginStudio.newFile')}
          </Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={createFolder}>
            {t('pluginStudio.newFolder')}
          </Button>
        </div>
      </div>
      <nav
        aria-label={t('pluginStudio.projectFiles')}
        className="flex gap-1 overflow-x-auto md:block md:space-y-1 md:overflow-visible"
      >
        {files.map((file) => (
          <Button
            key={file}
            size="sm"
            variant="ghost"
            aria-current={selectedFile === file ? 'page' : undefined}
            onClick={() => onSelect(file)}
            className={cn(
              'shrink-0 justify-start font-mono text-xs md:w-full',
              selectedFile === file &&
                'border-primary-state-border bg-primary-selected text-primary'
            )}
          >
            {file}
          </Button>
        ))}
      </nav>
      <div className="mt-2 grid grid-cols-3 gap-1 border-t border-border pt-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || protectedSelection}
          onClick={rename}
        >
          {t('pluginStudio.renameFile')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || protectedSelection}
          onClick={() => run(() => onDuplicate(selectedFile))}
        >
          {t('pluginStudio.duplicateFile')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || protectedSelection}
          onClick={remove}
        >
          {t('pluginStudio.deleteFile')}
        </Button>
      </div>
      {error ? (
        <Text variant="caption" tone="danger" className="mt-2 px-2" role="alert">
          {error}
        </Text>
      ) : null}
    </aside>
  );
}
