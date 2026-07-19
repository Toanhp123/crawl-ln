import { cn } from '@/shared/lib/cn';
export function StatusDot({
  tone = 'neutral',
  label
}: {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  label: string;
}) {
  const color = {
    neutral: 'bg-muted',
    info: 'bg-info',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger'
  }[tone];
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', color)} />
      <span>{label}</span>
    </span>
  );
}
