import { MoreHorizontal } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { CrawlNovelButton } from '@/features/crawl-novel/ui/CrawlNovelButton';
import { UpdateNovelButton } from '@/features/update-novel/ui/UpdateNovelButton';
import { ExportMenu } from '@/features/export-novel/ui/ExportMenu';
import { BottomSheet, Button, Text, type ActionState } from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';

export function NovelManagementSheet({
  novelId,
  updateActionState,
  crawlActionState,
  taskActive,
  onUpdate,
  onCrawl,
  triggerClassName
}: {
  novelId: string;
  updateActionState: ActionState;
  crawlActionState: ActionState;
  taskActive: boolean;
  onUpdate: () => void;
  onCrawl: () => void;
  triggerClassName?: ComponentProps<typeof Button>['className'];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        className={triggerClassName ?? 'w-full'}
        leadingIcon={<MoreHorizontal size={17} />}
        onClick={() => setOpen(true)}
      >
        {t('reader.manageNovel')}
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={t('reader.manageNovel')}
        description={t('reader.manageNovelDescription')}
      >
        <div className="grid gap-3">
          <Text variant="caption" tone="muted">
            {t('reader.manageNovelHint')}
          </Text>
          <UpdateNovelButton
            actionState={updateActionState}
            disabled={taskActive}
            onClick={onUpdate}
          />
          <CrawlNovelButton
            actionState={crawlActionState}
            disabled={taskActive}
            onClick={onCrawl}
          />
          <ExportMenu novelId={novelId} />
        </div>
      </BottomSheet>
    </>
  );
}
