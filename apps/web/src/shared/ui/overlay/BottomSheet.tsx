import type { ReactNode } from 'react';
import { ResponsiveDialog } from './ResponsiveDialog';

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={footer}
      variant="sheet"
      className={className}
    >
      {children}
    </ResponsiveDialog>
  );
}
