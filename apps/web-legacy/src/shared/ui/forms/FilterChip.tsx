import type { ButtonHTMLAttributes } from 'react';
import { Chip } from '../data-display/Chip';

export function FilterChip({
  selected,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return <Chip type={type} size="md" selected={selected} {...props} />;
}
