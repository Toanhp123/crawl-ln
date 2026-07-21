import { cn } from '../lib/cn';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export function ConnectionStatus({
  status,
  labels,
  className
}: {
  status: ConnectionState;
  labels?: Partial<Record<ConnectionState, string>>;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-2', className)}
      data-connection-status={status}
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
      {labels?.[status] ?? status}
    </span>
  );
}
