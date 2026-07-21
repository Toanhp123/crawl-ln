import { cn } from '../../lib/cn';

export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  tone = 'primary',
  className
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: 'primary' | 'success' | 'danger' | 'muted';
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const color =
    tone === 'success'
      ? 'hsl(var(--color-success))'
      : tone === 'danger'
        ? 'hsl(var(--color-danger))'
        : tone === 'muted'
          ? 'hsl(var(--color-text-muted))'
          : 'hsl(var(--color-primary))';
  return (
    <div
      className={cn('relative grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
      aria-label={`${clamped}%`}
      role="img"
    >
      <svg
        className="-rotate-90"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--color-border))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-[var(--motion-slow)] ease-out"
        />
      </svg>
      <span className="absolute type-title-sm font-semibold tabular-nums text-text">
        {clamped}%
      </span>
    </div>
  );
}
