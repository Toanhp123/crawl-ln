import { MoreHorizontal } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { AutoUpdateControl } from '@/features/update-auto-update';
import { ExportNovelControl } from '@/features/export-novel';
import { useI18n } from '@/shared/i18n';
import { Button, Drawer, Stack, Text, type ActionState } from '@/shared/ui';
import type { Novel } from '@/entities/novel';

export function NovelManagementSheet({
  novel,
  updateActionState,
  crawlActionState,
  taskActive,
  onUpdate,
  onCrawl,
  triggerClassName
}: {
  novel: Novel;
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
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={t('reader.manageNovel')}
        description={t('reader.manageNovelDescription')}
      >
        <Stack gap="md">
          <Text variant="caption" tone="muted">
            {t('reader.manageNovelHint')}
          </Text>
          <Button full actionState={updateActionState} disabled={taskActive} onClick={onUpdate}>
            {t('reader.updateAction')}
          </Button>
          <Button
            full
            variant="secondary"
            actionState={crawlActionState}
            disabled={taskActive}
            onClick={onCrawl}
          >
            {t('reader.crawlAction')}
          </Button>
          <AutoUpdateControl novel={novel} />
          <ExportNovelControl novelId={novel.id} />
        </Stack>
      </Drawer>
    </>
  );
}
