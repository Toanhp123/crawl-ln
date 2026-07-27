import { ChevronDown, Clipboard, Link2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Button, Input, Modal, Text } from '../../../shared/ui';
import { readClipboardText } from '../lib/read-clipboard';
import { useAddNovelOverlay } from '../model/add-novel-overlay-context';
import { canCloseAddNovelOverlay } from '../model/can-close-add-novel-overlay';
import { useAddNovel } from '../model/use-add-novel';

export function AddNovelOverlay() {
  const overlay = useAddNovelOverlay();
  const { t, errorMessage } = useI18n();
  const [url, setUrl] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const reset = () => {
    setUrl('');
    setAdvancedOpen(false);
  };
  const addNovel = useAddNovel({
    onSuccess: () => {
      reset();
      overlay.close();
    }
  });

  const close = () => {
    if (!canCloseAddNovelOverlay(addNovel.isPending)) return;
    addNovel.reset();
    reset();
    overlay.close();
  };

  const paste = async () => {
    try {
      const value = await readClipboardText();
      if (value) setUrl(value);
    } catch {
      // Clipboard permission may be denied; manual input stays available.
    }
  };

  return (
    <Modal
      open={overlay.isOpen}
      onOpenChange={(open) => !open && close()}
      title={t('addNovel.title')}
      description={t('addNovel.description')}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!addNovel.isPending) addNovel.mutate(url);
        }}
      >
        <div>
          <label className="sr-only" htmlFor="add-novel-url">
            {t('addNovel.url')}
          </label>
          <div className="flex items-stretch gap-2">
            <div className="relative min-w-0 flex-1">
              <Link2
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                size={17}
              />
              <Input
                id="add-novel-url"
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
              aria-label={t('addNovel.paste')}
              onClick={() => void paste()}
              disabled={addNovel.isPending}
            >
              <Clipboard size={18} />
            </Button>
          </div>
          {addNovel.isError ? (
            <Text as="p" variant="caption" tone="danger" className="mt-2">
              {errorMessage(addNovel.error, 'common.requestFailed')}
            </Text>
          ) : null}
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-between rounded-[var(--radius-md)] px-1 py-2 text-left type-body-sm font-semibold text-muted outline-none hover:text-text focus-visible:shadow-[var(--focus-ring)]"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((current) => !current)}
        >
          {t('addNovel.advanced')}
          <ChevronDown
            size={17}
            className={advancedOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
          />
        </button>

        {advancedOpen ? (
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface2 p-3">
            <Text variant="caption" tone="muted">
              {t('addNovel.advancedDescription')}
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
          {t('addNovel.submit')}
        </Button>
      </form>
    </Modal>
  );
}
