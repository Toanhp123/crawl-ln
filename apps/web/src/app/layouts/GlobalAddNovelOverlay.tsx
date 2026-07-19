import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Clipboard, Link2, Plus } from 'lucide-react';
import { analyzeNovel } from '@/features/analyze-novel/api/analyzeNovel';
import { crawlNovel } from '@/features/crawl-novel/api/crawlNovel';
import { BottomSheet, Button, Input, Text, toast } from '@/shared/ui';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { useGlobalAddNovel } from '@/shared/model/GlobalAddNovelContext';

export function GlobalAddNovelOverlay() {
  const overlay = useGlobalAddNovel();
  const queryClient = useQueryClient();
  const { t, errorMessage } = useI18n();
  const [url, setUrl] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const addNovel = useMutation({
    mutationFn: async (sourceUrl: string) => {
      const detail = await analyzeNovel(sourceUrl);
      return crawlNovel(detail.novel.id);
    },
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.novelsRoot });
      void queryClient.invalidateQueries({ queryKey: queryKeys.novelStats });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskSummary });
      void queryClient.invalidateQueries({ queryKey: queryKeys.novelTask(task.novelId) });
      setUrl('');
      setAdvancedOpen(false);
      overlay.close();
      toast({
        kind: 'info',
        title: t('crawl.toast.queued'),
        description: t('globalAdd.queuedDescription')
      });
    }
  });

  const close = () => {
    if (addNovel.isPending) return;
    addNovel.reset();
    setUrl('');
    setAdvancedOpen(false);
    overlay.close();
  };

  const pasteUrl = async () => {
    try {
      const value = await navigator.clipboard.readText();
      if (value) setUrl(value.trim());
    } catch {
      // Clipboard permission can be denied; the input remains available for manual paste.
    }
  };

  return (
    <BottomSheet
      open={overlay.isOpen}
      onOpenChange={(open) => !open && close()}
      title={t('globalAdd.title')}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const clean = url.trim();
          if (clean && !addNovel.isPending) addNovel.mutate(clean);
        }}
      >
        <div>
          <Text as="p" variant="supporting" tone="muted" className="mb-3">
            {t('globalAdd.description')}
          </Text>
          <label className="sr-only" htmlFor="global-add-novel-url">
            {t('common.novelUrl')}
          </label>
          <div className="flex items-stretch gap-2">
            <div className="relative min-w-0 flex-1">
              <Link2
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                size={17}
              />
              <Input
                id="global-add-novel-url"
                autoFocus
                inputMode="url"
                autoComplete="url"
                value={url}
                disabled={addNovel.isPending}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://novel-site.com/novel/..."
                className="h-12 pl-10"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="aspect-square h-12 w-12 shrink-0 p-0"
              aria-label={t('globalAdd.pasteUrl')}
              onClick={() => void pasteUrl()}
              disabled={addNovel.isPending}
            >
              <Clipboard size={18} />
            </Button>
          </div>
          {addNovel.isError ? (
            <Text as="p" variant="caption" tone="danger" className="mt-2">
              {errorMessage(addNovel.error, 'common.errorDescription')}
            </Text>
          ) : null}
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-between rounded-[var(--radius-md)] px-1 py-2 text-left type-body-sm font-semibold text-muted outline-none hover:text-text focus-visible:shadow-[var(--focus-ring)]"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((current) => !current)}
        >
          {t('globalAdd.advanced')}
          <ChevronDown
            size={17}
            className={advancedOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
          />
        </button>

        {advancedOpen ? (
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface2 p-3">
            <Text variant="caption" tone="muted">
              {t('globalAdd.advancedDescription')}
            </Text>
          </div>
        ) : null}

        <Button
          full
          size="lg"
          className="h-12"
          actionState={addNovel.status}
          leadingIcon={<Plus size={18} />}
          disabled={!url.trim()}
        >
          {t('globalAdd.submit')}
        </Button>
      </form>
    </BottomSheet>
  );
}
