import { useI18n } from '../../../shared/i18n';
import { cn } from '../../../shared/lib/cn';
import { Button, Text } from '../../../shared/ui';

export function PluginProjectFileTree({
  files,
  selectedFile,
  onSelect
}: {
  files: string[];
  selectedFile: string;
  onSelect: (path: string) => void;
}) {
  const { t } = useI18n();
  return (
    <aside className="min-w-0 border-b border-border bg-surface2 p-2 md:border-b-0 md:border-r">
      <Text as="h3" variant="caption" tone="muted" className="px-2 py-2 font-bold uppercase">
        {t('pluginStudio.projectFiles')}
      </Text>
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
    </aside>
  );
}
