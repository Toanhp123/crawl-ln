import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type StackProps = HTMLAttributes<HTMLDivElement> & {
  gap?: 'sm' | 'md' | 'lg';
};

const gapClass = {
  sm: 'space-y-3',
  md: 'space-y-4',
  lg: 'space-y-5'
};

export function Stack({ gap = 'md', className, ...props }: StackProps) {
  return <div className={cn(gapClass[gap], className)} {...props} />;
}
