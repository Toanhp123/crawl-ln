import type { ReactNode } from 'react';

export function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2.5">
      <span className="type-section-label text-muted">{label}</span>
      {children}
      {hint && <span className="block type-supporting text-muted">{hint}</span>}
    </label>
  );
}
