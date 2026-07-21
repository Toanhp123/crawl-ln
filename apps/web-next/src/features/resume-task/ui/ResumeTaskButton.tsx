import { Play } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Button, type ButtonProps } from '../../../shared/ui';
import { useResumeTask } from '../model/use-resume-task';

export function ResumeTaskButton({ taskId, children, ...props }: ButtonProps & { taskId: string }) {
  const mutation = useResumeTask();
  const { t } = useI18n();
  return (
    <Button
      {...props}
      actionState={mutation.status}
      leadingIcon={props.leadingIcon ?? <Play size={17} />}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) mutation.mutate(taskId);
      }}
    >
      {children ?? t('resumeTask.action')}
    </Button>
  );
}
