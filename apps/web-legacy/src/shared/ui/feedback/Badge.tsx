import type { HTMLAttributes } from 'react';
import { Chip, type ChipTone } from '../data-display/Chip';

export function Badge({
  tone = 'neutral',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Exclude<ChipTone, 'primary'> }) {
  return <Chip tone={tone} size="sm" {...props} />;
}
