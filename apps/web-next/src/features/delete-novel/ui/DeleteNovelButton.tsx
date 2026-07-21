import { Trash2 } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Button, type ButtonProps } from '../../../shared/ui';
import { useDeleteNovel } from '../model/use-delete-novel';

export function DeleteNovelButton({
  novelId,
  onDeleted,
  children,
  ...props
}: ButtonProps & { novelId: string; onDeleted?: (novelId: string) => void }) {
  const mutation = useDeleteNovel({ onDeleted });
  const { t } = useI18n();
  return (
    <Button
      {...props}
      variant={props.variant ?? 'danger'}
      actionState={mutation.status}
      leadingIcon={props.leadingIcon ?? <Trash2 size={17} />}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) mutation.mutate(novelId);
      }}
    >
      {children ?? t('deleteNovel.action')}
    </Button>
  );
}
