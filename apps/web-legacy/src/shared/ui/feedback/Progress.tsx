export function Progress({ value, label }: { value: number; label?: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(safe)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 overflow-hidden rounded-pill bg-surface3"
    >
      <div
        className="h-full rounded-pill bg-primary transition-all duration-[var(--motion-slow)]"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}
