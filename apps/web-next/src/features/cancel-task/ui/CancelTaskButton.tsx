import { X } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Button, type ButtonProps } from '../../../shared/ui';
import { useCancelTask } from '../model/use-cancel-task';

export function CancelTaskButton({ taskId, children, ...props }: ButtonProps & { taskId: string }) {
  const mutation = useCancelTask();
  const { t } = useI18n();
  return (
    <Button
      {...props}
      variant={props.variant ?? 'danger'}
      actionState={mutation.status}
      leadingIcon={props.leadingIcon ?? <X size={17} />}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) mutation.mutate(taskId);
      }}
    >
      {children ?? t('cancelTask.action')}
    </Button>
  );
}
