import type { ReactNode } from 'react';
import { ResponsiveDialog } from './ResponsiveDialog';

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  className
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      variant="drawer"
      className={className}
    >
      {children}
    </ResponsiveDialog>
  );
}
