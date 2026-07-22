import { Button } from '../actions/Button';
import type { ActionState } from '../actions/actionFeedback';
import { Modal } from './Modal';
import { useI18n } from '../../i18n/I18nProvider';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText,
  danger,
  actionState = 'idle',
  onConfirm
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  actionState?: ActionState;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {cancelText ?? t('common.cancel')}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            actionState={actionState}
            onClick={onConfirm}
          >
            {confirmText ?? t('common.confirm')}
          </Button>
        </>
      }
    />
  );
}
