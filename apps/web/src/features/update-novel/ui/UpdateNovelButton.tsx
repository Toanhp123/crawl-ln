import { RefreshCw } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Button, type ButtonProps } from '../../../shared/ui';
import { useUpdateNovel } from '../model/use-update-novel';

export function UpdateNovelButton({
  novelId,
  children,
  ...props
}: ButtonProps & { novelId: string }) {
  const mutation = useUpdateNovel();
  const { t } = useI18n();
  return (
    <Button
      {...props}
      actionState={mutation.status}
      leadingIcon={props.leadingIcon ?? <RefreshCw size={17} />}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) mutation.mutate(novelId);
      }}
    >
      {children ?? t('updateNovel.action')}
    </Button>
  );
}
