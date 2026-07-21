import { Pause } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Button, type ButtonProps } from '../../../shared/ui';
import { usePauseTask } from '../model/use-pause-task';

export function PauseTaskButton({ taskId, children, ...props }: ButtonProps & { taskId: string }) {
  const mutation = usePauseTask();
  const { t } = useI18n();
  return (
    <Button
      {...props}
      actionState={mutation.status}
      leadingIcon={props.leadingIcon ?? <Pause size={17} />}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) mutation.mutate(taskId);
      }}
    >
      {children ?? t('pauseTask.action')}
    </Button>
  );
}
